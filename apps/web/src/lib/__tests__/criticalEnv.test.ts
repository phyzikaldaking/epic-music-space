import { describe, expect, it } from "vitest";

import {
  assertCriticalEnvironment,
  getCriticalEnvironmentHealthReport,
  validateCriticalEnvironment,
} from "@/lib/criticalEnv";

describe("criticalEnv", () => {
  it("treats non-production as non-production-like", () => {
    const report = validateCriticalEnvironment({ NODE_ENV: "development" });
    expect(report.isProductionLike).toBe(false);
    expect(report.envName).toBe("development");
  });

  it("requires production-only keys in VERCEL_ENV=production", () => {
    const report = validateCriticalEnvironment({ VERCEL_ENV: "production" });

    expect(report.isProductionLike).toBe(true);
    expect(report.issues.some((issue) => issue.severity === "error")).toBe(true);
    expect(report.issues.map((issue) => issue.code)).toContain("missing_database_url");
  });

  it("validates site url formats", () => {
    const report = validateCriticalEnvironment({
      VERCEL_ENV: "production",
      DATABASE_URL: "postgres://example",
      DIRECT_URL: "postgres://example",
      NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      SUPABASE_SERVICE_ROLE_KEY: "service",
      AUTH_SECRET: "secret",
      CRON_SECRET: "secret",
      INTERNAL_API_TOKEN: "token",
      OPENAI_API_KEY: "key",
      RESEND_API_KEY: "key",
      NEXT_PUBLIC_SITE_URL: "not-a-url",
    });

    expect(report.issues.map((issue) => issue.code)).toContain("invalid_site_url");
  });

  it("warns on partial integration configuration", () => {
    const report = validateCriticalEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example",
      LIVEKIT_API_KEY: "key",
      // LIVEKIT_API_SECRET missing
      NEXT_PUBLIC_LIVEKIT_URL: "https://livekit.example",
      MUX_TOKEN_ID: "id",
      // MUX_TOKEN_SECRET missing
    });

    const warningCodes = report.issues
      .filter((issue) => issue.severity === "warning")
      .map((issue) => issue.code);
    expect(warningCodes).toContain("partial_livekit_config");
    expect(warningCodes).toContain("partial_mux_config");
  });

  it("assertCriticalEnvironment throws when errors exist", () => {
    expect(() => assertCriticalEnvironment({ VERCEL_ENV: "production" })).toThrow(
      /Invalid runtime configuration/i,
    );
  });

  it("assertCriticalEnvironment supports productionOnly option", () => {
    expect(() => assertCriticalEnvironment({ NODE_ENV: "development" }, { productionOnly: true })).not.toThrow();
  });

  it("health report returns ok when no issues", () => {
    const report = getCriticalEnvironmentHealthReport({
      NODE_ENV: "development",
      NEXT_PUBLIC_SITE_URL: "https://example.com",
      NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example",
      LIVEKIT_API_KEY: "",
      LIVEKIT_API_SECRET: "",
      NEXT_PUBLIC_LIVEKIT_URL: "",
      MUX_TOKEN_ID: "",
      MUX_TOKEN_SECRET: "",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      REDIS_URL: "redis://example",
    });

    expect(report.status).toBe("ok");
  });
});

