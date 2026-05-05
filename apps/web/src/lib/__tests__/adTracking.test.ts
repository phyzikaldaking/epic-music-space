import { describe, expect, it, vi } from "vitest";

import { clientIp, hashIp } from "@/lib/adTracking";

describe("adTracking", () => {
  it("clientIp prefers x-forwarded-for first entry", () => {
    const req = new Request("https://example.com", {
      headers: {
        "x-forwarded-for": "203.0.113.9, 10.0.0.1",
        "x-real-ip": "198.51.100.4",
      },
    });

    expect(clientIp(req)).toBe("203.0.113.9");
  });

  it("clientIp falls back to x-real-ip", () => {
    const req = new Request("https://example.com", {
      headers: {
        "x-real-ip": "198.51.100.4",
      },
    });

    expect(clientIp(req)).toBe("198.51.100.4");
  });

  it("clientIp returns unknown when no headers", () => {
    const req = new Request("https://example.com");
    expect(clientIp(req)).toBe("unknown");
  });

  it("hashIp is stable within the same day and uses the salt", () => {
    vi.stubEnv("AD_TRACKING_SALT", "test-salt");
    vi.setSystemTime(new Date("2026-01-02T10:00:00.000Z"));

    const first = hashIp("203.0.113.9");
    const second = hashIp("203.0.113.9");

    expect(first).toBe(second);
    expect(first).toHaveLength(32);
  });

  it("hashIp rotates when the day changes", () => {
    vi.stubEnv("AD_TRACKING_SALT", "test-salt");
    vi.setSystemTime(new Date("2026-01-02T10:00:00.000Z"));
    const first = hashIp("203.0.113.9");

    vi.setSystemTime(new Date("2026-01-03T10:00:00.000Z"));
    const second = hashIp("203.0.113.9");

    expect(first).not.toBe(second);
  });
});

