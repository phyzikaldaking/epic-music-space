#!/usr/bin/env node
/**
 * Post-deploy smoke test. Hits a handful of routes against a deployed
 * URL and asserts that nothing 4xx-or-worse'd, plus that key page
 * markers (e.g. "Beat Machine" on /studio) actually rendered.
 *
 * Usage:
 *   node scripts/smoke.mjs                         # uses BASE_URL or default
 *   node scripts/smoke.mjs https://my-deploy.url   # explicit base URL
 *
 * Catches the failure modes we've already burned ourselves on:
 *   - Studio shipped invisible in the nav (no /studio link from /)
 *   - /studio rendering 404/blank because of a build regression
 *   - OAuth provider list missing google (env mis-set)
 */

const BASE = (process.argv[2] || process.env.BASE_URL || "https://epicmusicspace.com").replace(/\/$/, "");

/** @type {Array<{path: string; expectStatus?: number[]; mustContain?: string[]; mustNotContain?: string[]; description: string}>} */
const checks = [
  {
    path: "/",
    description: "homepage renders + nav exposes Studio",
    mustContain: [
      'href="/studio"',
      'href="/studio/live"',
    ],
  },
  {
    path: "/studio",
    description: "public /studio landing renders the DAW marketing",
    mustContain: ["Beat Machine", "in your browser"],
  },
  {
    path: "/marketplace",
    description: "marketplace page renders without auth",
    mustContain: ["Marketplace"],
    mustNotContain: ["Application error", "Error: A tree"],
  },
  {
    path: "/auctions",
    description: "auctions listing is publicly browsable",
    mustContain: ["Live Auctions"],
  },
  {
    path: "/api/auth/providers",
    description: "NextAuth advertises Google + credentials providers",
    mustContain: ['"google"', '"credentials"'],
  },
  {
    path: "/api/auth/csrf",
    description: "NextAuth CSRF endpoint responds with a token",
    mustContain: ["csrfToken"],
  },
  {
    // Auth-gated; we only assert it returns 401 for an anonymous request,
    // which proves the route exists and the auth check is wired.
    path: "/api/health/config",
    description: "config health endpoint is reachable + auth-gated",
    expectStatus: [401, 403],
  },
];

let failed = 0;
const start = Date.now();
console.log(`[smoke] target: ${BASE}`);

for (const check of checks) {
  const url = `${BASE}${check.path}`;
  let res;
  try {
    res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "ems-smoke/1" } });
  } catch (err) {
    console.error(`[smoke] ✗ ${check.path} — fetch threw: ${err.message}`);
    failed++;
    continue;
  }

  const expected = check.expectStatus ?? [200];
  if (!expected.includes(res.status)) {
    console.error(`[smoke] ✗ ${check.path} — HTTP ${res.status}, expected ${expected.join(" or ")} (${check.description})`);
    failed++;
    continue;
  }

  let body;
  if (check.mustContain && check.mustContain.length > 0) {
    body = await res.text();
    const missing = check.mustContain.filter((m) => !body.includes(m));
    if (missing.length > 0) {
      console.error(`[smoke] ✗ ${check.path} — body missing markers: ${missing.join(", ")} (${check.description})`);
      failed++;
      continue;
    }
  }

  if (check.mustNotContain && check.mustNotContain.length > 0) {
    if (body == null) body = await res.text();
    const present = check.mustNotContain.filter((m) => body.includes(m));
    if (present.length > 0) {
      console.error(`[smoke] ✗ ${check.path} — body contains forbidden markers: ${present.join(", ")} (${check.description})`);
      failed++;
      continue;
    }
  }

  console.log(`[smoke] ✓ ${check.path} — ${check.description}`);
}

// CSP + nonce-on-scripts check on the homepage.
//
// We check TWO things, because checking just the header is insufficient:
//   1. Header has script-src with a nonce + strict-dynamic
//   2. The HTML actually USES that nonce on its inline <script> tags
//
// Regression 96f9769 had a perfect CSP header but layout.tsx no longer
// passed nonce={nonce} to its inline scripts, so Next's auto-injected
// flight payloads rendered without nonces and hydration broke. Header
// alone was green; the page was dead.
try {
  const res = await fetch(`${BASE}/`, { redirect: "follow", headers: { "User-Agent": "ems-smoke/1" } });
  const csp = res.headers.get("content-security-policy") ?? "";
  const scriptSrc = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src"));
  const headerNonceMatch = scriptSrc?.match(/'nonce-([a-zA-Z0-9+/=_-]+)'/);
  const headerNonce = headerNonceMatch?.[1] ?? null;

  if (!scriptSrc) {
    console.error(`[smoke] ✗ /  — Content-Security-Policy header missing script-src directive`);
    failed++;
  } else if (!headerNonce) {
    console.error(`[smoke] ✗ /  — script-src has no nonce: ${scriptSrc}`);
    failed++;
  } else if (!/strict-dynamic/.test(scriptSrc) && !/'unsafe-inline'/.test(scriptSrc)) {
    // strict-dynamic is what lets Next's nonced root authorize transitively
    // loaded chunks. Without it (or unsafe-inline), the inline flight
    // scripts get blocked and hydration silently fails.
    console.error(`[smoke] ✗ /  — script-src missing 'strict-dynamic' (hydration will break): ${scriptSrc}`);
    failed++;
  } else {
    // Header looks right. Now verify the body actually uses the nonce.
    const html = await res.text();
    const inlineScripts = html.match(/<script(?![^>]*\bsrc=)[^>]*>/g) ?? [];
    const noncedScripts = inlineScripts.filter((tag) =>
      new RegExp(`nonce=["']?${headerNonce}["']?`).test(tag),
    );
    if (inlineScripts.length > 0 && noncedScripts.length === 0) {
      console.error(
        `[smoke] ✗ /  — CSP nonce in header but ${inlineScripts.length} inline scripts carry NO nonce attribute (hydration will break). First script: ${inlineScripts[0]?.slice(0, 160)}`,
      );
      failed++;
    } else {
      console.log(
        `[smoke] ✓ / — CSP nonce + strict-dynamic correct, ${noncedScripts.length}/${inlineScripts.length} inline scripts nonced`,
      );
    }
  }
} catch (err) {
  console.error(`[smoke] ✗ / — CSP probe threw: ${err.message}`);
  failed++;
}

const dur = Math.round((Date.now() - start) / 100) / 10;
if (failed > 0) {
  console.error(`\n[smoke] ${failed} check(s) failed in ${dur}s`);
  process.exit(1);
}
console.log(`\n[smoke] all ${checks.length} checks passed in ${dur}s`);
