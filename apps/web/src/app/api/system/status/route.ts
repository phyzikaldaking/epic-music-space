import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function checkDatabase() {
  if (!process.env.DATABASE_URL) return { ok: false, detail: "DATABASE_URL missing" };
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return { ok: true, detail: "database reachable" };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "database check failed" };
  }
}

export async function GET() {
  const database = await checkDatabase();
  const livekit = Boolean(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET && process.env.LIVEKIT_URL);
  const status = database.ok && livekit ? "ok" : database.ok ? "degraded" : "down";
  return NextResponse.json({
    status,
    checkedAt: new Date().toISOString(),
    services: {
      database,
      livekit: { ok: livekit, detail: livekit ? "configured" : "missing LiveKit env" },
      exportWorker: { ok: false, detail: "queued API ready; offline renderer worker pending" },
      realtime: { ok: database.ok, detail: database.ok ? "operation log ready" : "realtime persistence degraded" },
    },
  }, { status: status === "down" ? 503 : 200 });
}
