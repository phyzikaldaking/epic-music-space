import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { moderateLimiter, strictLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";

/**
 * POST /api/tracks/[id]/like
 * Toggle like on a track. Returns { liked: boolean, count: number }.
 * Auth required.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: songId } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  try {
    await moderateLimiter.consume(`track-like:${ip}`);
  } catch {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to like tracks." }, { status: 401 });
  }

  try {
    await strictLimiter.consume(`track-like:${session.user.id}:${songId}`);
  } catch {
    return NextResponse.json({ error: "Slow down." }, { status: 429 });
  }

  const song = await prisma.song.findUnique({
    where: { id: songId, isActive: true },
    select: { id: true },
  });
  if (!song) {
    return NextResponse.json({ error: "Track not found." }, { status: 404 });
  }

  const existing = await prisma.trackLike.findUnique({
    where: { songId_userId: { songId, userId: session.user.id } },
  });

  if (existing) {
    await prisma.trackLike.delete({ where: { id: existing.id } });
  } else {
    await prisma.trackLike.create({
      data: { songId, userId: session.user.id },
    });
  }

  const count = await prisma.trackLike.count({ where: { songId } });

  return NextResponse.json({ liked: !existing, count });
}

/**
 * GET /api/tracks/[id]/like
 * Returns { liked: boolean, count: number } for the current user.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: songId } = await params;

  const session = await auth();
  const userId = session?.user?.id;

  const [count, liked] = await Promise.all([
    prisma.trackLike.count({ where: { songId } }),
    userId
      ? prisma.trackLike.findUnique({
          where: { songId_userId: { songId, userId } },
        }).then((r) => !!r)
      : Promise.resolve(false),
  ]);

  return NextResponse.json({ liked, count });
}
