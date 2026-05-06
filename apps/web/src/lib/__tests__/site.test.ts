import { describe, it, expect, beforeEach, afterEach } from "vitest";

// We import getSiteUrl lazily (inside each test) because the module reads env
// vars at call time rather than at import time, so resetting process.env is
// sufficient to exercise all branches.

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const originalNodeEnv = process.env.NODE_ENV;

function cleanEnv() {
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;
}

afterEach(() => {
  // Restore originals
  if (originalSiteUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  }
  if (originalAppUrl === undefined) {
    delete process.env.NEXT_PUBLIC_APP_URL;
  } else {
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  }
});

// ---------------------------------------------------------------------------
// Helper — import getSiteUrl fresh for each group so the module-level
// NODE_ENV fallback is captured at the time it matters.
// ---------------------------------------------------------------------------

async function getSiteUrl() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return (await import("@/lib/site")).getSiteUrl;
}

describe("getSiteUrl", () => {
  it("returns the value of NEXT_PUBLIC_SITE_URL when it is a valid http URL", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://myapp.example.com";
    const fn = await getSiteUrl();
    expect(fn()).toBe("https://myapp.example.com");
  });

  it("strips a trailing slash from NEXT_PUBLIC_SITE_URL", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://myapp.example.com/";
    const fn = await getSiteUrl();
    expect(fn()).toBe("https://myapp.example.com");
  });

  it("returns the first entry when NEXT_PUBLIC_SITE_URL is a comma-separated list", async () => {
    process.env.NEXT_PUBLIC_SITE_URL =
      "https://primary.example.com, https://secondary.example.com";
    const fn = await getSiteUrl();
    expect(fn()).toBe("https://primary.example.com");
  });

  it("falls back to NEXT_PUBLIC_APP_URL when NEXT_PUBLIC_SITE_URL is absent", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    const fn = await getSiteUrl();
    expect(fn()).toBe("https://app.example.com");
  });

  it("falls back to localhost:3000 in non-production when neither env var is set", async () => {
    cleanEnv();
    // NODE_ENV is 'test' here, not 'production', so fallback = localhost
    const fn = await getSiteUrl();
    const url = fn();
    expect(url).toBe("http://localhost:3000");
  });

  it("returns the fallback URL when the env value does not start with 'http'", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "not-a-url";
    const fn = await getSiteUrl();
    const url = fn();
    // non-http prefix → should use fallback (localhost in test env)
    expect(url).toBe("http://localhost:3000");
  });

  it("supports http (non-TLS) URLs", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://staging.example.com";
    const fn = await getSiteUrl();
    expect(fn()).toBe("http://staging.example.com");
  });

  it("does not include a trailing slash in the returned URL", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.com/";
    const fn = await getSiteUrl();
    expect(fn()).not.toMatch(/\/$/);
  });
});
