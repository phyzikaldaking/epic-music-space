import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCriticalEnvironmentHealthReport } from "@/lib/criticalEnv";
import { getRedis } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  const envReport = getCriticalEnvironmentHealthReport();

  let database = {
    ok: true,
    latencyMs: 0,
  };
  let redis:
    | { configured: false; ok: false; latencyMs: 0; required: boolean }
    | { configured: true; ok: boolean; latencyMs: number; required: boolean; error?: string } = {
    configured: false,
    ok: false,
    latencyMs: 0,
    required: envReport.isProductionLike,
  };

  try {
    const dbStartedAt = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    database.latencyMs = Date.now() - dbStartedAt;
  } catch (error) {
    database = {
      ok: false,
      latencyMs: 0,
    };
    console.error("[health:ready:database]", error);
  }

  const redisClient = getRedis();
  if (redisClient) {
    const redisStartedAt = Date.now();
    try {
      await redisClient.ping();
      redis = {
        configured: true,
        ok: true,
        latencyMs: Date.now() - redisStartedAt,
        required: envReport.isProductionLike,
      };
    } catch (error) {
      redis = {
        configured: true,
        ok: false,
        latencyMs: Date.now() - redisStartedAt,
        required: envReport.isProductionLike,
        error: error instanceof Error ? error.message : "Redis ping failed",
      };
      console.error("[health:ready:redis]", error);
    }
  }

  const redisBlocksReadiness = redis.required && !redis.ok;
  const status =
    envReport.status === "down" || !database.ok || redisBlocksReadiness
      ? "down"
      : envReport.status === "degraded" || !redis.ok
        ? "degraded"
        : "ok";
  const httpStatus = status === "down" ? 503 : 200;

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      checks: {
        environment: envReport,
        database,
        redis,
      },
    },
    { status: httpStatus },
  );
}
