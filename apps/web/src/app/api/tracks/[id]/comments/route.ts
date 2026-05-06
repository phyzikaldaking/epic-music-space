import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lenientLimiter, moderateLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";

const createSchema = z.object({
  body: z.string().min(1, "Comment cannot be empty").max(1000, "Comment too long (max 1000 chars)"),
});

/**
 * GET /api/tracks/[id]/comments?cursor=string&limit=25
 * Public, rate-limited per IP.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: songId } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await lenientLimiter.consume(`track-comments:${ip}`);
  } catch {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 25)));

  const comments = await prisma.trackComment.findMany({
    where: { songId },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: {
        select: {
          id: true,
          name: true,
          image: true,
          studio: { select: { username: true } },
        },
      },
    },
  });

  const hasMore = comments.length > limit;
  const items = hasMore ? comments.slice(0, limit) : comments;
  const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null;

  return NextResponse.json({ comments: items, nextCursor });
}

/**
 * POST /api/tracks/[id]/comments
 * Auth required. Body: { body: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: songId } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await moderateLimiter.consume(`track-comment-write:${ip}`);
  } catch {
    return NextResponse.json(
      { error: "Too many comments. Wait a moment." },
      { status: 429 },
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to comment." }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const song = await prisma.song.findUnique({
    where: { id: songId, isActive: true },
    select: { id: true },
  });
  if (!song) {
    return NextResponse.json({ error: "Track not found." }, { status: 404 });
  }

  const comment = await prisma.trackComment.create({
    data: {
      songId,
      authorId: session.user.id,
      body: parsed.data.body.trim(),
    },
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: {
        select: {
          id: true,
          name: true,
          image: true,
          studio: { select: { username: true } },
        },
      },
    },
  });

  return NextResponse.json({ comment }, { status: 201 });
}
