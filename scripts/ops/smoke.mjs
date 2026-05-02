import process from "node:process";

const DEFAULT_BASE_URL = process.env.SYNTHETICS_BASE_URL ?? "https://epicmusicspace.com";

const checks = [
  { name: "homepage", method: "GET", path: "/", expected: [200] },
  { name: "signin", method: "GET", path: "/auth/signin", expected: [200] },
  { name: "signup", method: "GET", path: "/auth/signup", expected: [200] },
  { name: "marketplace", method: "GET", path: "/marketplace", expected: [200] },
  { name: "health", method: "GET", path: "/api/health", expected: [200] },
  { name: "listings", method: "GET", path: "/api/market/listings", expected: [200] },
  { name: "leaderboard", method: "GET", path: "/api/leaderboard", expected: [200] },
  {
    name: "checkout_guard",
    method: "POST",
    path: "/api/checkout",
    body: { songId: "cm00000000000000000000000" },
    expected: [401, 429],
  },
];

function maskUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

async function runCheck(baseUrl, check, timeoutMs) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(maskUrl(baseUrl, check.path), {
      method: check.method,
      headers: check.body ? { "content-type": "application/json" } : undefined,
      body: check.body ? JSON.stringify(check.body) : undefined,
      signal: controller.signal,
    });

    return {
      ...check,
      status: res.status,
      elapsedMs: Date.now() - startedAt,
      ok: check.expected.includes(res.status),
    };
  } catch (error) {
    return {
      ...check,
      status: 0,
      elapsedMs: Date.now() - startedAt,
      ok: false,
      error: error instanceof Error ? error.message : "unknown",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runSmoke(options = {}) {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const timeoutMs = Number(options.timeoutMs ?? process.env.SMOKE_TIMEOUT_MS ?? 10_000);

  const results = [];
  for (const check of checks) {
    const result = await runCheck(baseUrl, check, timeoutMs);
    results.push(result);
    const marker = result.ok ? "OK" : "FAIL";
    console.log(`${marker} ${check.method} ${check.path} -> ${result.status} (${result.elapsedMs}ms)`);
    if (result.error) {
      console.error(`  error: ${result.error}`);
    }
  }

  const failed = results.filter((r) => !r.ok);
  return {
    baseUrl,
    results,
    passed: failed.length === 0,
    failed,
  };
}

async function main() {
  const report = await runSmoke();

  if (!report.passed) {
    console.error(`Smoke checks failed (${report.failed.length}/${report.results.length})`);
    process.exit(1);
  }

  console.log(`Smoke checks passed (${report.results.length}/${report.results.length})`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
