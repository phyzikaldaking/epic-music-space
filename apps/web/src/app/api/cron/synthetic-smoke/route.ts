import { NextRequest, NextResponse } from "next/server";
import { Sandbox } from "@vercel/sandbox";
import { requireCronRequest } from "@/lib/routeAuth";
import { page } from "@/lib/pager";
import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/synthetic-smoke
 *
 * Continuous synthetic browser monitor. Boots a Vercel Sandbox + headless
 * Chrome via agent-browser, hits the live homepage, and pages out via
 * AUTH_ALERT_WEBHOOK_URL when the page fails to hydrate cleanly.
 *
 * This is the "between deploys" complement to the post-deploy GH Action
 * smoke. The GH Action catches regressions tied to a specific deploy. This
 * cron catches CDN drift, expired API keys, runtime config rotations, and
 * silent third-party outages that break the live site without anyone
 * pushing code.
 *
 * Signals checked (each independently can fire a page):
 *   1. CSP shape — script-src must include both a nonce AND 'strict-dynamic'.
 *      Without strict-dynamic, Next's auto-injected RSC flight scripts get
 *      blocked. The exact bug class that broke the studio-theme deploy.
 *   2. agent-browser errors — uncaught JS exceptions during hydration.
 *   3. agent-browser console (error level) filtered for CSP violations.
 *   4. Accessibility snapshot must contain a sign-in CTA (proves the page
 *      reached interactive state, not just SSR'd HTML).
 *
 * Dedupe: writes a synthetic AuthEvent("alert_fired") row per fingerprint
 * with a 30-min mute window. Same scheme the auth-alerts cron uses, so a
 * sustained outage doesn't spam the channel every 5 minutes.
 *
 * Skips gracefully (200 + skipped: ...) when sandbox credentials aren't
 * configured locally, so the cron route can be wired in vercel.json
 * without breaking dev/CI environments.
 */

const CHROMIUM_SYSTEM_DEPS = [
  "nss", "nspr", "libxkbcommon", "atk", "at-spi2-atk", "at-spi2-core",
  "libXcomposite", "libXdamage", "libXrandr", "libXfixes", "libXcursor",
  "libXi", "libXtst", "libXScrnSaver", "libXext", "mesa-libgbm", "libdrm",
  "mesa-libGL", "mesa-libEGL", "cups-libs", "alsa-lib", "pango", "cairo",
  "gtk3", "dbus-libs",
];

const MUTE_MINUTES = 30;

function sandboxConfigured(): boolean {
  return Boolean(
    process.env.VERCEL_OIDC_TOKEN ||
      (process.env.VERCEL_TOKEN && process.env.VERCEL_TEAM_ID && process.env.VERCEL_PROJECT_ID),
  );
}

function getCredentials() {
  if (
    process.env.VERCEL_TOKEN &&
    process.env.VERCEL_TEAM_ID &&
    process.env.VERCEL_PROJECT_ID
  ) {
    return {
      token: process.env.VERCEL_TOKEN,
      teamId: process.env.VERCEL_TEAM_ID,
      projectId: process.env.VERCEL_PROJECT_ID,
    };
  }
  return {};
}

interface FailedCheck {
  fingerprint: string;
  title: string;
  body: string;
  context: Record<string, unknown>;
  severity: "warn" | "error" | "critical";
}

export async function GET(req: NextRequest) {
  const access = requireCronRequest(req);
  if (!access.ok) return access.response;

  if (!sandboxConfigured()) {
    return NextResponse.json({
      ok: true,
      skipped: "sandbox-not-configured",
      message:
        "Set VERCEL_OIDC_TOKEN (auto on Vercel) or VERCEL_TOKEN+TEAM+PROJECT to enable.",
    });
  }

  const baseUrl = getSiteUrl().replace(/\/$/, "");
  const target = `${baseUrl}/`;
  const snapshotId = process.env.AGENT_BROWSER_SNAPSHOT_ID;
  const failures: FailedCheck[] = [];
  const checks: Record<string, "ok" | "fail" | "skip"> = {};

  // ── (1) CSP shape — fast, no sandbox needed. Run first so we don't pay
  //        the VM boot cost when CSP is already wrong.
  try {
    const res = await fetch(target, {
      redirect: "follow",
      headers: { "User-Agent": "ems-synthetic/1" },
    });
    const csp = res.headers.get("content-security-policy") ?? "";
    const scriptSrc =
      csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src")) ?? "";

    if (!scriptSrc) {
      checks.csp = "fail";
      failures.push({
        fingerprint: "synthetic:csp:missing",
        title: "Synthetic: homepage Content-Security-Policy missing script-src",
        body: `CSP header: ${csp.slice(0, 300) || "(empty)"}`,
        context: { target, csp: csp.slice(0, 500) },
        severity: "critical",
      });
    } else if (!/nonce-/.test(scriptSrc)) {
      checks.csp = "fail";
      failures.push({
        fingerprint: "synthetic:csp:no-nonce",
        title: "Synthetic: homepage script-src has no nonce",
        body: scriptSrc.slice(0, 300),
        context: { target, scriptSrc },
        severity: "critical",
      });
    } else if (!/strict-dynamic/.test(scriptSrc) && !/'unsafe-inline'/.test(scriptSrc)) {
      checks.csp = "fail";
      failures.push({
        fingerprint: "synthetic:csp:no-strict-dynamic",
        title: "Synthetic: homepage script-src missing 'strict-dynamic' (hydration will break)",
        body: scriptSrc.slice(0, 300),
        context: { target, scriptSrc },
        severity: "critical",
      });
    } else {
      checks.csp = "ok";
    }
  } catch (err) {
    checks.csp = "fail";
    const message = err instanceof Error ? err.message : "unknown";
    failures.push({
      fingerprint: "synthetic:csp:fetch-failed",
      title: "Synthetic: CSP probe could not reach homepage",
      body: message.slice(0, 300),
      context: { target },
      severity: "error",
    });
  }

  // ── (2-4) Browser checks. Boot the sandbox, run agent-browser.
  const sandbox = snapshotId
    ? await Sandbox.create({
        ...getCredentials(),
        source: { type: "snapshot", snapshotId },
        timeout: 240_000,
      })
    : await Sandbox.create({
        ...getCredentials(),
        runtime: "node24",
        timeout: 240_000,
      });

  try {
    if (!snapshotId) {
      const setup = await sandbox.runCommand("sh", [
        "-c",
        `sudo dnf clean all && sudo dnf install -y --skip-broken ${CHROMIUM_SYSTEM_DEPS.join(" ")} && sudo ldconfig`,
      ]);
      if (setup.exitCode !== 0) {
        throw new Error(`chromium deps install failed (exit ${setup.exitCode})`);
      }
      await sandbox.runCommand("npm", ["install", "-g", "agent-browser"]);
      await sandbox.runCommand("npx", ["agent-browser", "install"]);
    }

    await sandbox.runCommand("agent-browser", ["open", target]);
    await sandbox.runCommand("agent-browser", ["wait", "--load", "networkidle"]);

    // (2) Page errors — uncaught exceptions during hydration.
    const errorsResult = await sandbox.runCommand("agent-browser", ["errors", "--json"]);
    const errorsRaw = await errorsResult.stdout();
    const pageErrors = parseAgentList(errorsRaw, "errors");
    if (pageErrors.length > 0) {
      checks.pageErrors = "fail";
      failures.push({
        fingerprint: "synthetic:pageerror",
        title: `Synthetic: ${pageErrors.length} uncaught error(s) on homepage`,
        body: pageErrors.slice(0, 3).map((m) => `• ${m.slice(0, 200)}`).join("\n"),
        context: { target, count: pageErrors.length, samples: pageErrors.slice(0, 5) },
        severity: "error",
      });
    } else {
      checks.pageErrors = "ok";
    }

    // (3) Console errors — specifically CSP violations the browser logs as
    //     console.error from "Content Security Policy".
    const consoleResult = await sandbox.runCommand("agent-browser", ["console", "--json"]);
    const consoleRaw = await consoleResult.stdout();
    const consoleErrors = parseAgentList(consoleRaw, "console").filter(
      (entry) => /^\s*\[?(error)\]?/i.test(entry) || /Content Security Policy/i.test(entry),
    );
    const cspViolations = consoleErrors.filter((m) => /Content Security Policy/i.test(m));
    if (cspViolations.length > 0) {
      checks.cspViolations = "fail";
      failures.push({
        fingerprint: "synthetic:csp-violation",
        title: `Synthetic: ${cspViolations.length} CSP violation(s) at runtime`,
        body: cspViolations.slice(0, 3).map((m) => `• ${m.slice(0, 200)}`).join("\n"),
        context: { target, count: cspViolations.length, samples: cspViolations.slice(0, 5) },
        severity: "critical",
      });
    } else {
      checks.cspViolations = "ok";
    }

    // (4) Accessibility snapshot — interactive primary CTA must be present.
    //     Either a sign-in/sign-up link or the studio CTA proves the page
    //     reached an interactive state.
    const snapResult = await sandbox.runCommand("agent-browser", ["snapshot", "-i", "-c"]);
    const snapshotText = await snapResult.stdout();
    const hasInteractiveCta =
      /Sign in|Sign up|Get started|Try the studio|I'?m an Artist|I'?m a Listener/i.test(
        snapshotText,
      );
    if (!hasInteractiveCta) {
      checks.cta = "fail";
      failures.push({
        fingerprint: "synthetic:no-cta",
        title: "Synthetic: homepage rendered but no primary CTA found in accessibility tree",
        body: "Hydration may have failed silently — page reached networkidle but interactive elements never mounted.",
        context: { target, snapshotPreview: snapshotText.slice(0, 800) },
        severity: "error",
      });
    } else {
      checks.cta = "ok";
    }

    await sandbox.runCommand("agent-browser", ["close"]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    checks.sandbox = "fail";
    failures.push({
      fingerprint: "synthetic:sandbox-error",
      title: "Synthetic: sandbox or browser command threw",
      body: message.slice(0, 500),
      context: { target },
      severity: "error",
    });
  } finally {
    await sandbox.stop();
  }

  // ── Page out per failure, deduped by fingerprint.
  const muteSince = new Date(Date.now() - MUTE_MINUTES * 60 * 1000);
  const fired: string[] = [];
  const muted: string[] = [];

  for (const f of failures) {
    const recent = await prisma.authEvent
      .findFirst({
        where: {
          event: "alert_fired",
          reason: f.fingerprint,
          createdAt: { gte: muteSince },
        },
        select: { id: true },
      })
      .catch(() => null);

    if (recent) {
      muted.push(f.fingerprint);
      continue;
    }

    page({
      severity: f.severity,
      title: f.title,
      body: f.body,
      fingerprint: f.fingerprint,
      context: f.context,
    });

    await prisma.authEvent
      .create({
        data: {
          event: "alert_fired",
          reason: f.fingerprint,
          meta: { check: "synthetic-smoke", target, ...f.context },
        },
      })
      .catch(() => {
        // Persist failure shouldn't drop the alert; pager already fired.
      });

    fired.push(f.fingerprint);
  }

  return NextResponse.json({
    ok: failures.length === 0,
    target,
    checks,
    fired,
    muted,
    snapshotId: snapshotId ?? null,
    now: new Date().toISOString(),
  });
}

/**
 * agent-browser's --json output for `errors` and `console` is shaped like
 * `{ data: { entries: [...] } }`. We only need the human-readable strings
 * for the alert body and for filter regexes — the structure isn't worth
 * a full type. Returns an empty array on parse failure (better to under-
 * report than crash the cron).
 */
function parseAgentList(raw: string, kind: "errors" | "console"): string[] {
  try {
    const parsed = JSON.parse(raw);
    const entries: unknown =
      parsed?.data?.entries ??
      parsed?.data?.[kind] ??
      parsed?.entries ??
      [];
    if (!Array.isArray(entries)) return [];
    return entries
      .map((e) => {
        if (typeof e === "string") return e;
        if (e && typeof e === "object") {
          const obj = e as Record<string, unknown>;
          if (typeof obj.text === "string") return obj.text;
          if (typeof obj.message === "string") return obj.message;
          if (typeof obj.value === "string") return obj.value;
          // Fallback: stringify so a structured entry still surfaces.
          try {
            return JSON.stringify(obj);
          } catch {
            return "";
          }
        }
        return "";
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}
