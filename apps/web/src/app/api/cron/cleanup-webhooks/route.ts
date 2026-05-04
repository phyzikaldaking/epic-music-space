import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Daily cleanup: drop ProcessedWebhook rows older than 30 days. Stripe and
 * Mux both retry inside a much shorter window, so 30 days is generous and
 * keeps the dedupe table from growing unbounded.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authed =
    secret && req.headers.get("authorization") === `Bearer ${secret}`;
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const result = await prisma.processedWebhook.deleteMany({
    where: { processedAt: { lt: cutoff } },
  });

  return NextResponse.json({
    ok: true,
    deletedRows: result.count,
    cutoff: cutoff.toISOString(),
  });
}
