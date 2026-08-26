import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getMuxClient } from "@/lib/mux";
import { getStripeHealthReport } from "@/lib/stripeEnv";
import { getCriticalEnvironmentHealthReport } from "@/lib/criticalEnv";

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

async function checkConfiguration(): Promise<ServiceCheck> {
  const report = getCriticalEnvironmentHealthReport();
  return {
    name: "configuration",
    status: report.status,
    message: report.issues[0]?.message,
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
  const result = await getStripeHealthReport();
  return {
    name: "stripe",
    status: result.status,
    latencyMs: result.latencyMs,
    message: result.message,
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

async function checkPostHog(): Promise<ServiceCheck> {
  const apiKey = process.env.POSTHOG_API_KEY;
  const host = process.env.POSTHOG_HOST ?? "https://us.i.posthog.com";
  if (!apiKey) return { name: "posthog", status: "not_configured", message: "POSTHOG_API_KEY is not set" };
  if (!apiKey.startsWith("phc_")) return { name: "posthog", status: "down", message: "POSTHOG_API_KEY has an invalid format" };
  try {
    const response = await fetch(new URL("/flags?v=1", host), {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(3000),
    });
    return { name: "posthog", status: response.ok ? "ok" : "down", message: response.ok ? undefined : `HTTP ${response.status}` };
  } catch (error) {
    return { name: "posthog", status: "down", message: error instanceof Error ? error.message : String(error) };
  }
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

// In-memory cache so /status (which auto-refreshes every 30s) doesn't ping
// every external service on every page load. Survives across requests on the
// same Lambda instance; Vercel cold starts re-prime, which is fine.
let healthCache: { at: number; payload: unknown } | null = null;
const HEALTH_CACHE_MS = 30_000;

export async function GET() {
  if (healthCache && Date.now() - healthCache.at < HEALTH_CACHE_MS) {
    const payload = healthCache.payload as { status: string };
    return NextResponse.json(payload, {
      status: payload.status === "down" ? 503 : 200,
      headers: { "Cache-Control": "public, max-age=30" },
    });
  }

  const [configuration, db, redis, supabase, stripe, mux, livekit, posthog] = await Promise.all([
    checkConfiguration(),
    checkDb(),
    checkRedis(),
    checkSupabase(),
    checkStripe(),
    checkMux(),
    checkLiveKit(),
    checkPostHog(),
  ]);

  const services = [configuration, db, redis, supabase, stripe, mux, livekit, posthog];
  // Liveness and core readiness must not be taken down by optional integrations.
  // Stripe/Mux/PostHog/Supabase diagnostics remain visible, but only the
  // application configuration, database, or Redis can make the app overall down.
  const coreServices = [configuration, db, redis];
  const coreDown = coreServices.some((s) => s.status === "down");
  const allServicesOk = services.every((s) => s.status === "ok" || s.status === "not_configured");

  const overall: "healthy" | "degraded" | "down" = coreDown
    ? "down"
    : allServicesOk
      ? "healthy"
      : "degraded";

  const payload = {
    status: overall,
    timestamp: new Date().toISOString(),
    services,
  };
  healthCache = { at: Date.now(), payload };
  return NextResponse.json(payload, {
    status: overall === "down" ? 503 : 200,
    headers: { "Cache-Control": "public, max-age=30" },
  });
}
