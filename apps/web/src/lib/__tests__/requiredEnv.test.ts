import { describe, expect, it } from "vitest";
import { inspectEnv } from "@/lib/requiredEnv";

const validEnv = {
  DATABASE_URL: "postgresql://user:pw@host:5432/db",
  NEXTAUTH_URL: "https://epicmusicspace.com",
  NEXTAUTH_SECRET: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  GOOGLE_CLIENT_ID:
    "1028428320148-o0jvoe0k4n39fcju4ud2u0gib906bu3i.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "GOCSPX-aaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  STRIPE_SECRET_KEY: "sk_live_aaaaaaaaaaaa",
  STRIPE_WEBHOOK_SECRET: "whsec_aaaaaaaaaaaa",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdef.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJ...",
  SUPABASE_SERVICE_ROLE_KEY: "eyJ...",
  APPLE_CLIENT_ID: "com.epicmusicspace.app",
  APPLE_CLIENT_SECRET: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
} as Record<string, string | undefined>;

describe("inspectEnv", () => {
  it("reports zero issues when every required key is set + valid", () => {
    expect(inspectEnv(validEnv)).toEqual([]);
  });

  it("flags the GOOGLE_CLIENT_ID = '' incident we hit in production", () => {
    const env = { ...validEnv, GOOGLE_CLIENT_ID: "" };
    const issues = inspectEnv(env);
    expect(issues).toHaveLength(1);
    expect(issues[0].key).toBe("GOOGLE_CLIENT_ID");
    expect(issues[0].reason).toBe("empty");
    expect(issues[0].severity).toBe("required");
  });

  it("flags placeholder values copied from .env.example", () => {
    const env = {
      ...validEnv,
      GOOGLE_CLIENT_ID: "your_google_client_id.apps.googleusercontent.com",
    };
    const issues = inspectEnv(env);
    expect(issues.find((i) => i.key === "GOOGLE_CLIENT_ID")?.reason).toBe(
      "placeholder",
    );
  });

  it("flags pattern mismatches (e.g. wrong Stripe key prefix)", () => {
    const env = { ...validEnv, STRIPE_SECRET_KEY: "pk_live_wrongkind" };
    const issues = inspectEnv(env);
    expect(issues.find((i) => i.key === "STRIPE_SECRET_KEY")?.reason).toBe(
      "pattern",
    );
  });

  it("treats missing recommended keys as severity:recommended (not required)", () => {
    const env = { ...validEnv };
    delete env.APPLE_CLIENT_ID;
    delete env.APPLE_CLIENT_SECRET;
    const issues = inspectEnv(env);
    expect(issues.every((i) => i.severity === "recommended")).toBe(true);
  });
});
