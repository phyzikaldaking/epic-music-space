import process from "node:process";

const DEFAULT_BASE_URL = process.env.SYNTHETICS_BASE_URL ?? "https://epicmusicspace.com";

const checks = [
  { name: "signin_page", method: "GET", path: "/auth/signin", expected: [200] },
  { name: "nextauth_providers", method: "GET", path: "/api/auth/providers", expected: [200] },
  {
    name: "register_not_false_bot_block",
    method: "POST",
    path: "/api/auth/register",
    body: {},
    expected: [400, 429],
    browserLike: true,
    failIfBodyIncludes: ["couldn't verify the request", "normal browser"],
  },
  {
    name: "google_callback_health",
    method: "GET",
    path: "/api/auth/callback/google",
    expected: [302, 400, 401],
  },
  {
    name: "password_reset_request",
    method: "POST",
    path: "/api/auth/password-reset/request",
    body: { email: "smoke+auth@epicmusicspace.com" },
    expected: [200, 400, 429],
  },
  {
    name: "phone_request_code",
    method: "POST",
    path: "/api/auth/phone/request-code",
    body: { phone: "+15555550123" },
    expected: [200, 400, 429, 503],
  },
];

function url(baseUrl, path) {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

async function runCheck(baseUrl, check, timeoutMs) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const requestHeaders = {
      ...(check.body ? { "content-type": "application/json" } : {}),
      ...(check.browserLike
        ? {
            "user-agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
            "sec-fetch-site": "same-origin",
            "sec-fetch-mode": "cors",
            origin: baseUrl.replace(/\/$/, ""),
            referer: `${baseUrl.replace(/\/$/, "")}/auth/signup`,
          }
        : {}),
    };

    const res = await fetch(url(baseUrl, check.path), {
      method: check.method,
      redirect: "manual",
      headers: Object.keys(requestHeaders).length > 0 ? requestHeaders : undefined,
      body: check.body ? JSON.stringify(check.body) : undefined,
      signal: controller.signal,
    });
    const rawBody = await res.text().catch(() => "");
    const bodyLower = rawBody.toLowerCase();
    const blockedByBody = (check.failIfBodyIncludes ?? []).some((snippet) =>
      bodyLower.includes(String(snippet).toLowerCase()),
    );

    return {
      ...check,
      status: res.status,
      elapsedMs: Date.now() - startedAt,
      ok: check.expected.includes(res.status) && !blockedByBody,
      bodySnippet: rawBody.slice(0, 300),
      blockedByBody,
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

export async function runAuthSmoke(options = {}) {
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
    if (result.blockedByBody) {
      console.error(`  blocked by response body pattern: ${result.bodySnippet}`);
    }
  }

  const failed = results.filter((r) => !r.ok);
  return {
    baseUrl,
    results,
    failed,
    passed: failed.length === 0,
  };
}

async function main() {
  const report = await runAuthSmoke();

  if (!report.passed) {
    console.error(`Auth smoke checks failed (${report.failed.length}/${report.results.length})`);
    process.exit(1);
  }

  console.log(`Auth smoke checks passed (${report.results.length}/${report.results.length})`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
