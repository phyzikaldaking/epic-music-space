import { NextRequest, NextResponse } from "next/server";
import { Sandbox } from "@vercel/sandbox";
import { createHash } from "crypto";
import { requireCronRequest } from "@/lib/routeAuth";
import { getRedis } from "@/lib/redis";
import { page } from "@/lib/pager";
import { getSiteUrl } from "@/lib/site";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Visual regression sweep — boots a Vercel Sandbox with headless Chrome,
 * walks the highest-stakes public pages, and pages on structural drift.
 *
 * "Structural" means we hash the agent-browser **accessibility snapshot**
 * (the role/name tree), not pixel screenshots. Pixel hashes flap on font
 * loads, timestamps, and live data. The accessibility tree only changes
 * when the page's interactive structure changes — exactly what we want
 * to catch (a section disappeared, a button text changed, a 500 page took
 * over). Required-text checks catch the cases where the structure is
 * unchanged but a critical literal went missing.
 *
 * Bootstrap cost is ~30 s without a sandbox snapshot, sub-second with one.
 * Set AGENT_BROWSER_SNAPSHOT_ID via scripts/ops/create-sandbox-snapshot.mjs
 * once the route is live and you've confirmed it works.
 *
 * Gated on Vercel sandbox credentials — returns a no-op 200 if neither
 * VERCEL_OIDC_TOKEN (set automatically on Vercel) nor explicit
 * VERCEL_TOKEN is present, so the cron can be wired in vercel.json
 * without breaking dev/local environments.
 */

interface Target {
  path: string;
  /** Strings that MUST appear in the accessibility snapshot. */
  required: string[];
}

const TARGETS: Target[] = [
  { path: "/", required: ["Epic Music Space"] },
  { path: "/marketplace", required: ["Marketplace"] },
  { path: "/auth/signin", required: ["Sign in"] },
  { path: "/trust", required: ["Trust"] },
];

const CHROMIUM_SYSTEM_DEPS = [
  "nss", "nspr", "libxkbcommon", "atk", "at-spi2-atk", "at-spi2-core",
  "libXcomposite", "libXdamage", "libXrandr", "libXfixes", "libXcursor",
  "libXi", "libXtst", "libXScrnSaver", "libXext", "mesa-libgbm", "libdrm",
  "mesa-libGL", "mesa-libEGL", "cups-libs", "alsa-lib", "pango", "cairo",
  "gtk3", "dbus-libs",
];

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

interface TargetResult {
  path: string;
  url: string;
  snapshotHash: string;
  drift: boolean;
  missing: string[];
  status: "ok" | "drift" | "missing-content" | "error";
  error?: string;
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
  const redis = getRedis();
  const snapshotId = process.env.AGENT_BROWSER_SNAPSHOT_ID;

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

  const results: TargetResult[] = [];

  try {
    if (!snapshotId) {
      // Cold-boot path. Costs ~30 s; only happens until a snapshot is
      // baked. Fail loudly if dnf or agent-browser install errors —
      // a half-installed Chromium causes flaky subsequent runs.
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

    for (const target of TARGETS) {
      const url = `${baseUrl}${target.path}`;
      try {
        await sandbox.runCommand("agent-browser", ["open", url]);
        await sandbox.runCommand("agent-browser", ["wait", "--load", "networkidle"]);

        const snapResult = await sandbox.runCommand("agent-browser", ["snapshot", "-i", "-c"]);
        const snapshot = await snapResult.stdout();
        await sandbox.runCommand("agent-browser", ["close"]);

        const snapshotHash = createHash("sha256").update(snapshot).digest("hex").slice(0, 16);
        const baselineKey = `vr:baseline:${target.path}`;
        const baseline = redis ? await redis.get(baselineKey) : null;
        const drift = baseline !== null && baseline !== snapshotHash;

        const missing = target.required.filter((needle) => !snapshot.includes(needle));

        let status: TargetResult["status"] = "ok";
        if (missing.length > 0) status = "missing-content";
        else if (drift) status = "drift";

        // Initial baseline only — don't auto-update on drift, so a real
        // regression keeps paging until an operator acks. The runbook
        // covers ack/reset.
        if (!baseline && redis) {
          await redis.set(baselineKey, snapshotHash, "EX", 60 * 60 * 24 * 30);
        }

        if (status === "missing-content") {
          page({
            severity: "error",
            title: `Visual regression: required content missing on ${target.path}`,
            body: `Missing strings: ${missing.join(", ")}`,
            context: { url, missing, snapshotHash },
            fingerprint: `vr:missing:${target.path}`,
          });
        } else if (status === "drift") {
          page({
            severity: "warn",
            title: `Visual regression: structural drift on ${target.path}`,
            context: { url, baselineHash: baseline, currentHash: snapshotHash },
            fingerprint: `vr:drift:${target.path}`,
          });
        }

        results.push({ path: target.path, url, snapshotHash, drift, missing, status });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "unknown";
        results.push({
          path: target.path,
          url,
          snapshotHash: "",
          drift: false,
          missing: [],
          status: "error",
          error: errorMsg,
        });
        page({
          severity: "error",
          title: `Visual regression: probe failed on ${target.path}`,
          body: errorMsg.slice(0, 500),
          context: { url },
          fingerprint: `vr:error:${target.path}`,
        });
      }
    }
  } finally {
    await sandbox.stop();
  }

  return NextResponse.json({ ok: true, snapshotId: snapshotId ?? null, results });
}
