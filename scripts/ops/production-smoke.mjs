#!/usr/bin/env node
/**
 * Production smoke test for the application and worker-facing health contract.
 * Usage: BASE_URL=https://epicmusicspace.com npm run smoke:production
 */
const base = (process.env.BASE_URL ?? process.env.SMOKE_BASE_URL ?? "").replace(/\/$/, "");
if (!base) { console.error("BASE_URL is required"); process.exit(2); }
const timeout = Number(process.env.SMOKE_TIMEOUT_MS ?? 10000);
const checks = [
  { path: "/api/health", statuses: [200, 503] },
  { path: "/studio", statuses: [200, 302, 307, 308] },
  { path: "/api/auth/providers", statuses: [200] },
];
let failed = 0;
for (const check of checks) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(base + check.path, { redirect: "manual", signal: controller.signal, headers: {"user-agent":"ems-production-smoke/1"} });
    if (!check.statuses.includes(response.status)) { console.error("FAIL", check.path, response.status); failed++; }
    else console.log("PASS", check.path, response.status);
  } catch (error) { console.error("FAIL", check.path, error instanceof Error ? error.message : String(error)); failed++; }
  finally { clearTimeout(timer); }
}
console.log(failed ? `${failed} smoke check(s) failed` : "production smoke passed");
process.exit(failed ? 1 : 0);
