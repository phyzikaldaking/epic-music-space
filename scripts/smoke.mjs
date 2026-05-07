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

/** @type {Array<{path: string; expectStatus?: number[]; mustContain?: string[]; description: string}>} */
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
    path: "/api/auth/providers",
    description: "NextAuth advertises Google as a provider",
    mustContain: ['"google"'],
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

  if (check.mustContain && check.mustContain.length > 0) {
    const body = await res.text();
    const missing = check.mustContain.filter((m) => !body.includes(m));
    if (missing.length > 0) {
      console.error(`[smoke] ✗ ${check.path} — body missing markers: ${missing.join(", ")} (${check.description})`);
      failed++;
      continue;
    }
  }

  console.log(`[smoke] ✓ ${check.path} — ${check.description}`);
}

const dur = Math.round((Date.now() - start) / 100) / 10;
if (failed > 0) {
  console.error(`\n[smoke] ${failed} check(s) failed in ${dur}s`);
  process.exit(1);
}
console.log(`\n[smoke] all ${checks.length} checks passed in ${dur}s`);
