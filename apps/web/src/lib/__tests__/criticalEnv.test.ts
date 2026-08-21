import { describe, expect, it } from "vitest";
import { assertCriticalEnvironment, validateCriticalEnvironment } from "@/lib/criticalEnv";

describe("validateCriticalEnvironment", () => {
  it("flags missing production runtime requirements", () => {
    const report = validateCriticalEnvironment({
      VERCEL_ENV: "production",
      DATABASE_URL: "",
      DIRECT_URL: "",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      AUTH_SECRET: "",
      CRON_SECRET: "",
      INTERNAL_API_TOKEN: "",
      OPENAI_API_KEY: "",
      RESEND_API_KEY: "",
    });

    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "missing_database_url",
        "missing_auth_secret",
        "missing_cron_secret",
        "missing_internal_api_token",
        "missing_redis_url",
      ]),
    );
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_redis_url", severity: "error" }),
      ]),
    );
  });

  it("treats the Railway production environment as production-like", () => {
    const report = validateCriticalEnvironment({
      RAILWAY_ENVIRONMENT_NAME: "production",
      DATABASE_URL: "",
      DIRECT_URL: "",
    });

    expect(report.isProductionLike).toBe(true);
    expect(report.envName).toBe("production");
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_database_url", severity: "error" }),
        expect.objectContaining({ code: "missing_redis_url", severity: "error" }),
      ]),
    );
  });

  it("warns when Redis is absent and LiveKit is partially configured", () => {
    const report = validateCriticalEnvironment({
      NODE_ENV: "development",
      LIVEKIT_API_KEY: "lk_key",
      NEXT_PUBLIC_LIVEKIT_URL: "https://livekit.example.com",
      TWILIO_ACCOUNT_SID: "sid",
    });

    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_redis_url", severity: "warning" }),
        expect.objectContaining({ code: "partial_livekit_config", severity: "warning" }),
        expect.objectContaining({ code: "partial_phone_auth_config", severity: "warning" }),
      ]),
    );
  });
});

describe("assertCriticalEnvironment", () => {
  it("throws for invalid production configuration", () => {
    expect(() =>
      assertCriticalEnvironment({
        VERCEL_ENV: "production",
        DATABASE_URL: "",
      }),
    ).toThrow(/Invalid runtime configuration/);
  });
});
