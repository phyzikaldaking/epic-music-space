import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { buildIdempotencyKey } from "../idempotency";

type MinimalNextRequest = {
  headers: {
    get(key: string): string | null;
  };
};

function reqWithHeaders(headers: Record<string, string>) {
  return {
    headers: {
      get: (key: string) => headers[key.toLowerCase()] ?? null,
    },
  } satisfies MinimalNextRequest;
}

describe("buildIdempotencyKey", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("uses the idempotency-key header when present", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const req = reqWithHeaders({ "idempotency-key": "  abc  " });
    const key1 = buildIdempotencyKey(req, "vote", ["user-1", 123]);
    const key2 = buildIdempotencyKey(req, "vote", ["user-1", 999]);

    // stable parts must not matter when header is present
    expect(key1).toBe(key2);
    expect(key1.startsWith("vote:")).toBe(true);
    expect(key1).toMatch(/^vote:[a-f0-9]{32}$/);
  });

  it("falls back to stable parts + 5-min time bucket", () => {
    vi.setSystemTime(new Date("2026-01-01T00:02:00.000Z"));
    const req = reqWithHeaders({});

    const key1 = buildIdempotencyKey(req, "checkout", ["user-1", 123, null]);
    const key2 = buildIdempotencyKey(req, "checkout", ["user-1", 123, undefined]);

    // null/undefined normalize to the same fingerprint
    expect(key1).toBe(key2);
    expect(key1).toMatch(/^checkout:[a-f0-9]{32}$/);
  });

  it("changes when stable parts change", () => {
    vi.setSystemTime(new Date("2026-01-01T00:02:00.000Z"));
    const req = reqWithHeaders({});

    const key1 = buildIdempotencyKey(req, "checkout", ["user-1", 123]);
    const key2 = buildIdempotencyKey(req, "checkout", ["user-2", 123]);
    expect(key1).not.toBe(key2);
  });

  it("changes when time bucket changes", () => {
    const req = reqWithHeaders({});

    vi.setSystemTime(new Date("2026-01-01T00:04:59.999Z"));
    const key1 = buildIdempotencyKey(req, "checkout", ["user-1", 123]);

    vi.setSystemTime(new Date("2026-01-01T00:05:00.000Z"));
    const key2 = buildIdempotencyKey(req, "checkout", ["user-1", 123]);

    expect(key1).not.toBe(key2);
  });
});
