import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getMuxClient } from "@/lib/mux";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ServiceCheck {
  name: string;
  status: "ok" | "degraded" | "down" | "not_configured";
  latencyMs?: number;
  message?: string;
}

async function timeIt<T>(fn: () => Promise<T>): Promise<{ value: T | null; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const value = await fn();
    return { value, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      value: null,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkDb(): Promise<ServiceCheck> {
  if (!process.env.DATABASE_URL) {
    return { name: "database", status: "not_configured" };
  }
  const result = await timeIt(() => prisma.$queryRaw`SELECT 1`);
  return {
    name: "database",
    status: result.error ? "down" : "ok",
    latencyMs: result.latencyMs,
    message: result.error,
  };
}

async function checkRedis(): Promise<ServiceCheck> {
  const redis = getRedis();
  if (!redis) return { name: "redis", status: "not_configured" };
  const result = await timeIt(async () => redis.ping());
  return {
    name: "redis",
    status: result.error ? "down" : "ok",
    latencyMs: result.latencyMs,
    message: result.error,
  };
}

async function checkSupabase(): Promise<ServiceCheck> {
  const client = createServerSupabaseClient();
  if (!client) return { name: "supabase_storage", status: "not_configured" };
  const result = await timeIt(async () => {
    const { error } = await client.storage.listBuckets();
    if (error) throw error;
  });
  return {
    name: "supabase_storage",
    status: result.error ? "down" : "ok",
    latencyMs: result.latencyMs,
    message: result.error,
  };
}

async function checkStripe(): Promise<ServiceCheck> {
  if (!process.env.STRIPE_SECRET_KEY) {
    return { name: "stripe", status: "not_configured" };
  }
  // Lazy import so unconfigured environments don't blow up at module-init.
  const result = await timeIt(async () => {
    const { stripe } = await import("@/lib/stripe");
    await stripe.balance.retrieve();
  });
  return {
    name: "stripe",
    status: result.error ? "down" : "ok",
    latencyMs: result.latencyMs,
    message: result.error,
  };
}

async function checkMux(): Promise<ServiceCheck> {
  const mux = getMuxClient();
  if (!mux) return { name: "mux", status: "not_configured" };
  const result = await timeIt(async () => {
    // Cheapest API: list one upload (no resources required).
    await mux.video.uploads.list({ limit: 1 });
  });
  return {
    name: "mux",
    status: result.error ? "down" : "ok",
    latencyMs: result.latencyMs,
    message: result.error,
  };
}

async function checkLiveKit(): Promise<ServiceCheck> {
  const configured = !!(
    process.env.LIVEKIT_API_KEY &&
    process.env.LIVEKIT_API_SECRET &&
    process.env.NEXT_PUBLIC_LIVEKIT_URL
  );
  return {
    name: "livekit",
    status: configured ? "ok" : "not_configured",
    message: configured ? "configured (no live ping)" : undefined,
  };
}

export async function GET() {
  const [db, redis, supabase, stripe, mux, livekit] = await Promise.all([
    checkDb(),
    checkRedis(),
    checkSupabase(),
    checkStripe(),
    checkMux(),
    checkLiveKit(),
  ]);

  const services = [db, redis, supabase, stripe, mux, livekit];
  const anyDown = services.some((s) => s.status === "down");
  const allConfiguredOk = services.every((s) => s.status === "ok" || s.status === "not_configured");

  const overall: "healthy" | "degraded" | "down" = anyDown
    ? "down"
    : allConfiguredOk
      ? "healthy"
      : "degraded";

  return NextResponse.json(
    {
      status: overall,
      timestamp: new Date().toISOString(),
      services,
    },
    { status: overall === "down" ? 503 : 200 },
  );
}
