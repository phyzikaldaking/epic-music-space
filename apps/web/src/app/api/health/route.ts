import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, "ok" | "error" | "unconfigured"> = {
    db: "unconfigured",
    stripe: "unconfigured",
    supabase: "unconfigured",
    openai: "unconfigured",
    redis: "unconfigured",
  };

  // Database
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("HOST")) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.db = "ok";
    } catch {
      checks.db = "error";
    }
  }

  // Stripe
  checks.stripe = process.env.STRIPE_SECRET_KEY?.startsWith("sk_") ? "ok" : "unconfigured";

  // Supabase
  checks.supabase = process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("supabase.co") ? "ok" : "unconfigured";

  // OpenAI
  checks.openai = process.env.OPENAI_API_KEY?.startsWith("sk-") ? "ok" : "unconfigured";

  // Redis
  checks.redis = process.env.REDIS_URL && !process.env.REDIS_URL.includes("host:6379") ? "ok" : "unconfigured";

  const allOk = Object.values(checks).every((v) => v === "ok");
  const hasErrors = Object.values(checks).some((v) => v === "error");

  return NextResponse.json(
    {
      status: allOk ? "healthy" : hasErrors ? "degraded" : "partial",
      timestamp: new Date().toISOString(),
      checks,
      missing: Object.entries(checks)
        .filter(([, v]) => v !== "ok")
        .map(([k]) => k),
    },
    { status: allOk ? 200 : 207 }
  );
}
