import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let dbOk = false;

  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("HOST")) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      console.error("DB_ERROR:", msg);
      return NextResponse.json(
        { status: "degraded", error: msg, timestamp: new Date().toISOString() },
        { status: 503 }
      );
    }
  }

  return NextResponse.json(
    { status: dbOk ? "healthy" : "degraded", timestamp: new Date().toISOString() },
    { status: dbOk ? 200 : 503 }
  );
}
