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
const TIMEOUT_MS = Math.max(1000, Number(process.env.SMOKE_TIMEOUT_MS ?? 15000));
const FAILURE_SNIPPET_LEN = Math.max(80, Number(process.env.SMOKE_FAILURE_SNIPPET_LEN ?? 220));
const CONCURRENCY = Math.max(1, Number(process.env.SMOKE_CONCURRENCY ?? 8));

const routes = [
  // Public marketing surface
  { path: "/", expect: 200 },
  { path: "/pricing", expect: 200 },
  { path: "/marketplace", expect: 200 },
  { path: "/leaderboard", expectIn: [200, 302, 307, 308] },
  { path: "/feed", expectIn: [200, 302, 307, 308] },
  { path: "/versus", expect: 200 },
  { path: "/auctions", expect: 200 },
  { path: "/services", expect: 200 },
  { path: "/rooms", expectIn: [200, 302, 307, 308] },
  { path: "/viral", expectIn: [200, 302, 307, 308] },
  { path: "/status", expect: 200 },
  { path: "/support", expect: 200 },
  { path: "/investors", expect: 200 },
  { path: "/trending", expectIn: [200, 302, 307, 308] },
  { path: "/search", expect: 200 },

  // Versus extensions (authed-only — expect a redirect when unauthenticated)
  { path: "/versus/inbox", expectIn: [200, 302, 307, 308] },
  { path: "/versus/new", expectIn: [200, 302, 307, 308] },
  { path: "/versus/history", expectIn: [200, 302, 307, 308] },
  { path: "/legal/terms", expect: 200 },
  { path: "/legal/privacy", expect: 200 },
  { path: "/legal/refunds", expect: 200 },
  { path: "/legal/licensing", expect: 200 },

  // Auth pages
  { path: "/auth/signin", expect: 200 },
  { path: "/auth/signup", expect: 200 },
  { path: "/auth/forgot-password", expect: 200 },
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
  console.log(`\n  Smoke test → ${BASE}`);
  console.log(`  timeout=${TIMEOUT_MS}ms · concurrency=${CONCURRENCY}\n`);

  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, routes.length) }, async () => {
    while (true) {
      const i = cursor;
      cursor += 1;
      if (i >= routes.length) break;
      const r = routes[i];
      const url = `${BASE}${r.path}`;
      const t0 = Date.now();
      let status = 0;
      let err = null;
      let failureSnippet = null;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        const res = await fetch(url, { redirect: "manual", signal: controller.signal });
        clearTimeout(timer);
        status = res.status;
        if (!(r.expectIn ?? [r.expect]).includes(status)) {
          const text = await res.text().catch(() => "");
          if (text) {
            const singleLine = text.replace(/\s+/g, " ").trim();
            failureSnippet = singleLine.slice(0, FAILURE_SNIPPET_LEN);
          }
        }
      } catch (e) {
        err = e instanceof Error ? e.message : String(e);
      }
      const ms = Date.now() - t0;
      const expected = r.expectIn ?? [r.expect];
      const ok = !err && expected.includes(status);
      results.push({ path: r.path, status, ms, ok, err, expected, failureSnippet });
      if (ok) passed += 1; else failed += 1;
    }
  });
  await Promise.all(workers);

  // Sorted output by status for easy scanning
  results.sort((a, b) => (a.ok === b.ok ? a.path.localeCompare(b.path) : a.ok ? 1 : -1));

  for (const r of results) {
    const icon = r.ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
    const statusStr = r.err ? `\x1b[31mERR\x1b[0m` : String(r.status);
    const expectStr = r.expected.length === 1 ? r.expected[0] : `[${r.expected.join(",")}]`;
    const tail = r.err
      ? ` — ${r.err}`
      : r.ok
        ? ""
        : ` — expected ${expectStr}${r.failureSnippet ? ` · body: ${r.failureSnippet}` : ""}`;
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
