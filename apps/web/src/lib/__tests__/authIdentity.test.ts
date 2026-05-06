import { describe, expect, it } from "vitest";
import { getClientIp, hashAuthToken, normalizeEmail } from "@/lib/authIdentity";

describe("authIdentity helpers", () => {
  it("normalizes email for consistent auth lookups", () => {
    expect(normalizeEmail("  User.Name+test@Example.COM ")).toBe(
      "user.name+test@example.com",
    );
  });

  it("prefers x-vercel-forwarded-for (trusted) over x-real-ip and x-forwarded-for", () => {
    const ip = getClientIp({
      get: (key: string) =>
        key === "x-vercel-forwarded-for"
          ? "203.0.113.10, 10.0.0.1"
          : key === "x-real-ip"
            ? "198.51.100.12"
            : key === "x-forwarded-for"
              ? "1.1.1.1"
              : null,
    });

    expect(ip).toBe("203.0.113.10");
  });

  it("prefers x-real-ip over x-forwarded-for (XFF is user-spoofable)", () => {
    const ip = getClientIp({
      get: (key: string) =>
        key === "x-real-ip"
          ? "198.51.100.12"
          : key === "x-forwarded-for"
            ? "1.1.1.1"
            : null,
    });

    expect(ip).toBe("198.51.100.12");
  });

  it("falls back to x-forwarded-for first hop only when nothing trustworthy is set", () => {
    const ip = getClientIp({
      get: (key: string) =>
        key === "x-forwarded-for" ? "203.0.113.10, 10.0.0.1" : null,
    });

    expect(ip).toBe("203.0.113.10");
  });

  it("hashes auth tokens deterministically", () => {
    expect(hashAuthToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
