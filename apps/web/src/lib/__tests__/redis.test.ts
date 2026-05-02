import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = process.env;

function loadRedisModule() {
  return import("../redis");
}

describe("redis", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.restoreAllMocks();
  });

  it("getRedis returns null when REDIS_URL is missing", async () => {
    delete process.env.REDIS_URL;
    const { getRedis } = await loadRedisModule();

    expect(getRedis()).toBeNull();
  });

  it("getRedis returns null for placeholder REDIS_URL", async () => {
    process.env.REDIS_URL = "redis://:password@example.com:6379";
    const { getRedis } = await loadRedisModule();

    expect(getRedis()).toBeNull();
  });

  it("cache helpers no-op when Redis is unavailable", async () => {
    delete process.env.REDIS_URL;
    const { cacheGet, cacheSet, cacheDel } = await loadRedisModule();

    await expect(cacheGet("k")).resolves.toBeNull();
    await expect(cacheSet("k", { a: 1 }, 10)).resolves.toBeUndefined();
    await expect(cacheDel("k")).resolves.toBeUndefined();
  });
});

