#!/usr/bin/env node
/**
 * Smoke test: hit every public route + key API endpoint and assert each
 * returns a healthy HTTP status. No browser, no auth, no fixtures — just
 * pings. Run it after every deploy:
 *
 *   BASE_URL=https://yourdomain.com node scripts/ops/smoke-test.mjs
 *
 * Defaults to http://localhost:3000 if BASE_URL is unset.
 *
 * Exits 0 on full pass, 1 on any failure. Pretty CLI output.
 */

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

const routes = [
  // Public marketing surface
  { path: "/", expect: 200 },
  { path: "/pricing", expect: 200 },
  { path: "/marketplace", expect: 200 },
  { path: "/leaderboard", expect: 200 },
  { path: "/feed", expect: 200 },
  { path: "/versus", expect: 200 },
  { path: "/auctions", expect: 200 },
  { path: "/services", expect: 200 },
  { path: "/rooms", expectIn: [200, 302, 307, 308] },
  { path: "/viral", expect: 200 },
  { path: "/status", expect: 200 },
  { path: "/support", expect: 200 },
  { path: "/investors", expect: 200 },
  { path: "/legal/terms", expect: 200 },
  { path: "/legal/privacy", expect: 200 },
  { path: "/legal/refunds", expect: 200 },
  { path: "/legal/licensing", expect: 200 },

  // Auth pages
  { path: "/auth/signin", expect: 200 },
  { path: "/auth/signup", expect: 200 },
  { path: "/auth/forgot", expect: 200 },
  { path: "/auth/verify-email", expect: 200 },

  // Authed-only pages: should redirect (3xx) when unauthenticated. Some
  // Next.js setups return 200 with a client-side redirect — accept either.
  { path: "/dashboard", expectIn: [200, 302, 307, 308] },
  { path: "/profile", expectIn: [302, 307, 308] }, // we redirect to signin
  { path: "/profile/edit", expectIn: [200, 302, 307, 308] },
  { path: "/studio", expectIn: [200, 302, 307, 308] },
  { path: "/studio/new", expectIn: [200, 302, 307, 308] },
  { path: "/notifications", expectIn: [200, 302, 307, 308] },

  // 404 sanity check — random slug should 404
  { path: "/track/this-id-should-not-exist-12345", expectIn: [404, 200] }, // 200 if your error.tsx renders 200

  // API: health + public list endpoints
  { path: "/api/health", expectIn: [200, 503] },
  { path: "/api/songs", expect: 200 },
  { path: "/api/posts", expect: 200 },
  { path: "/api/leaderboard", expect: 200 },
  { path: "/api/auctions", expect: 200 },
  { path: "/api/services", expect: 200 },
  { path: "/api/market/listings", expect: 200 },
];

const results = [];
let passed = 0;
let failed = 0;
const start = Date.now();

async function run() {
  console.log(`\n  Smoke test → ${BASE}\n`);

  await Promise.all(
    routes.map(async (r) => {
      const url = `${BASE}${r.path}`;
      const t0 = Date.now();
      let status = 0;
      let err = null;
      try {
        const res = await fetch(url, { redirect: "manual" });
        status = res.status;
      } catch (e) {
        err = e instanceof Error ? e.message : String(e);
      }
      const ms = Date.now() - t0;
      const expected = r.expectIn ?? [r.expect];
      const ok = !err && expected.includes(status);
      results.push({ path: r.path, status, ms, ok, err, expected });
      if (ok) passed += 1; else failed += 1;
    }),
  );

  // Sorted output by status for easy scanning
  results.sort((a, b) => (a.ok === b.ok ? a.path.localeCompare(b.path) : a.ok ? 1 : -1));

  for (const r of results) {
    const icon = r.ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
    const statusStr = r.err ? `\x1b[31mERR\x1b[0m` : String(r.status);
    const expectStr = r.expected.length === 1 ? r.expected[0] : `[${r.expected.join(",")}]`;
    const tail = r.err ? ` — ${r.err}` : r.ok ? "" : ` — expected ${expectStr}`;
    console.log(`  ${icon}  ${statusStr.padEnd(4)} ${String(r.ms + "ms").padEnd(7)} ${r.path}${tail}`);
  }

  const elapsed = Date.now() - start;
  console.log(`\n  ${passed} passed · ${failed} failed · ${elapsed}ms total\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((e) => {
  console.error("Smoke test crashed:", e);
  process.exit(2);
});
