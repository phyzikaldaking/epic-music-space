import { describe, expect, it } from "vitest";
import { appendCallbackParam, sanitizeCallbackPath } from "@/lib/safeCallback";

describe("sanitizeCallbackPath", () => {
  it("accepts internal paths with query strings", () => {
    expect(sanitizeCallbackPath("/studio/setup?next=/studio/new")).toBe(
      "/studio/setup?next=/studio/new",
    );
  });

  it("rejects external URLs", () => {
    expect(sanitizeCallbackPath("https://evil.example/studio/new")).toBe(
      "/dashboard",
    );
  });

  it("rejects protocol-relative URLs", () => {
    expect(sanitizeCallbackPath("//evil.example/studio/new")).toBe(
      "/dashboard",
    );
  });

  it("rejects empty values", () => {
    expect(sanitizeCallbackPath("")).toBe("/dashboard");
  });
});

describe("appendCallbackParam", () => {
  it("appends an encoded callback to URLs without query strings", () => {
    expect(appendCallbackParam("/auth/signin", "/studio/new")).toBe(
      "/auth/signin?callbackUrl=%2Fstudio%2Fnew",
    );
  });

  it("appends an encoded callback to URLs with query strings", () => {
    expect(appendCallbackParam("/auth/signin?verified=true", "/studio/new")).toBe(
      "/auth/signin?verified=true&callbackUrl=%2Fstudio%2Fnew",
    );
  });
});
