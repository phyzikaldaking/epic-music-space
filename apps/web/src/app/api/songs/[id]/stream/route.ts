import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { moderateLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // Rate limit: 30 increments per IP per minute across all songs (prevents bot inflation)
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  try {
    await moderateLimiter.consume(`stream:${ip}`);
  } catch {
    return NextResponse.json({ ok: true }); // Silently drop — don't reveal rate limit to scrapers
  }

  await prisma.song.updateMany({
    where: { id, isActive: true },
    data: { streamCount: { increment: 1 } },
  });

  return NextResponse.json({ ok: true });
}
