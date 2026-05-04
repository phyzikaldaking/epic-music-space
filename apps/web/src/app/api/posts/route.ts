import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { moderateLimiter, strictLimiter } from "@/lib/rateLimit";
import { getMuxClient } from "@/lib/mux";

const createPostSchema = z.object({
  body: z.string().min(1, "Post can't be empty").max(2000),
  imageUrl: z.string().url().optional(),
  songId: z.string().cuid().optional(),
  muxUploadId: z.string().optional(),
});

/**
 * GET /api/posts?cursor=&limit=&authorId=&following=1
 * Public feed by default. With ?following=1 (auth required), filters to posts
 * by users the caller follows + their own posts.
 */
export async function GET(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  try {
    await moderateLimiter.consume(`posts-list:${ip}`);
  } catch {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));
  const authorId = url.searchParams.get("authorId") ?? undefined;
  const followingMode = url.searchParams.get("following") === "1";

  let authorFilter: { in: string[] } | undefined;
  if (followingMode) {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const follows = await prisma.userFollow.findMany({
      where: { followerId: session.user.id },
      select: { followingId: true },
    });
    authorFilter = { in: [...follows.map((f) => f.followingId), session.user.id] };
  }

  const session = followingMode ? null : await auth();
  const viewerId = session?.user?.id;

  const posts = await prisma.post.findMany({
    where: {
      isPublished: true,
      ...(authorId ? { authorId } : {}),
      ...(authorFilter ? { authorId: authorFilter } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      author: {
        select: {
          id: true,
          name: true,
          image: true,
          role: true,
          studio: { select: { username: true } },
        },
      },
      _count: { select: { likes: true, comments: true } },
      ...(viewerId
        ? { likes: { where: { userId: viewerId }, select: { id: true } } }
        : {}),
    },
  });

  let nextCursor: string | null = null;
  if (posts.length > limit) {
    const last = posts.pop()!;
    nextCursor = last.id;
  }

  return NextResponse.json({
    posts: posts.map((p) => ({
      ...p,
      likedByMe: viewerId ? (p as { likes?: unknown[] }).likes?.length === 1 : false,
      likes: undefined,
    })),
    nextCursor,
  });
}

/**
 * POST /api/posts
 * Create a new post. Body: text required, optional imageUrl OR muxUploadId
 * (mutually exclusive in practice; UI enforces).
 */
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  try {
    await strictLimiter.consume(`post-create:${ip}`);
  } catch {
    return NextResponse.json(
      { error: "Posting too quickly — slow down." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createPostSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { body, imageUrl, songId, muxUploadId } = parsed.data;

  // If a video upload is claimed, verify it actually belongs to the caller —
  // we set passthrough = userId when creating the upload. Without this check
  // someone could PUT a post with another user's uploadId and steal the video.
  if (muxUploadId) {
    const mux = getMuxClient();
    if (!mux) {
      return NextResponse.json(
        { error: "Video uploads are not configured." },
        { status: 503 },
      );
    }
    try {
      const upload = await mux.video.uploads.retrieve(muxUploadId);
      const passthrough = upload.new_asset_settings?.passthrough;
      if (passthrough !== session.user.id) {
        return NextResponse.json(
          { error: "Upload does not belong to you" },
          { status: 403 },
        );
      }
      // Reject reusing the same upload across multiple posts.
      const existing = await prisma.post.findUnique({
        where: { muxUploadId },
        select: { id: true },
      });
      if (existing) {
        return NextResponse.json(
          { error: "This video has already been posted" },
          { status: 409 },
        );
      }
    } catch (err) {
      console.error("[posts:create] mux upload verify failed", err);
      return NextResponse.json(
        { error: "Could not verify video upload. Please try again." },
        { status: 400 },
      );
    }
  }

  const videoStatus = muxUploadId ? "UPLOADING" : "NONE";

  const post = await prisma.post.create({
    data: {
      authorId: session.user.id,
      body,
      imageUrl,
      songId,
      muxUploadId,
      videoStatus,
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          image: true,
          role: true,
          studio: { select: { username: true } },
        },
      },
      _count: { select: { likes: true, comments: true } },
    },
  });

  return NextResponse.json({ post }, { status: 201 });
}
