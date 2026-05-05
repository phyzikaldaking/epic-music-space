import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { moderateLimiter, strictLimiter } from "@/lib/rateLimit";
import { getMuxClient } from "@/lib/mux";
import { enqueueNotification } from "@/lib/queues";

// In-process cache for Mux upload ownership lookups. Keyed by uploadId,
// value carries the passthrough (= userId) and expiry. Lives only for the
// node lifetime — Vercel functions reuse instances under Fluid Compute,
// so this still meaningfully reduces Mux API calls under burst traffic.
const muxUploadOwnerCache = new Map<string, { passthrough: string; expiresAt: number }>();

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

  // Stitch in attached songs in a single query (Prisma model has songId but
  // no declared relation, so we fan out manually rather than adding a schema
  // change here).
  const songIds = Array.from(new Set(posts.map((p) => p.songId).filter((x): x is string => !!x)));
  const songs = songIds.length
    ? await prisma.song.findMany({
        where: { id: { in: songIds } },
        select: { id: true, title: true, artist: true, coverUrl: true, genre: true, licensePrice: true },
      })
    : [];
  const songMap = new Map(songs.map((s) => [s.id, { ...s, licensePrice: Number(s.licensePrice) }]));

  let nextCursor: string | null = null;
  if (posts.length > limit) {
    const last = posts.pop()!;
    nextCursor = last.id;
  }

  return NextResponse.json({
    posts: posts.map((p) => ({
      ...p,
      song: p.songId ? songMap.get(p.songId) ?? null : null,
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

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Per-user rate limit (separate from per-IP) so a coffee shop full of
  // users doesn't share one budget. Each user gets their own bucket; the IP
  // bucket only kicks in if the same IP is hammering with multiple users.
  try {
    await strictLimiter.consume(`post-create:user:${session.user.id}`);
    await strictLimiter.consume(`post-create:ip:${ip}`);
  } catch {
    return NextResponse.json(
      { error: "Posting too quickly — slow down." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
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
  //
  // The Mux retrieve() call is cached for 5 minutes per uploadId so that a
  // burst of post-create attempts from a flaky client (or a malicious one
  // probing random uploadIds) can't run up our Mux API quota.
  if (muxUploadId) {
    const mux = getMuxClient();
    if (!mux) {
      return NextResponse.json(
        { error: "Video uploads are not configured." },
        { status: 503 },
      );
    }
    try {
      const cached = muxUploadOwnerCache.get(muxUploadId);
      let passthrough: string | undefined;
      if (cached && cached.expiresAt > Date.now()) {
        passthrough = cached.passthrough;
      } else {
        const upload = await mux.video.uploads.retrieve(muxUploadId);
        passthrough = upload.new_asset_settings?.passthrough as string | undefined;
        muxUploadOwnerCache.set(muxUploadId, {
          passthrough: passthrough ?? "",
          expiresAt: Date.now() + 5 * 60 * 1000,
        });
        // Cap memory: when the map grows past 5k entries, drop the oldest
        // half. Map iteration order is insertion order, so this is FIFO.
        if (muxUploadOwnerCache.size > 5000) {
          const drop = Math.floor(muxUploadOwnerCache.size / 2);
          let i = 0;
          for (const k of muxUploadOwnerCache.keys()) {
            if (i++ >= drop) break;
            muxUploadOwnerCache.delete(k);
          }
        }
      }
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

  // Stitch in the attached song for the response.
  const attachedSong = post.songId
    ? await prisma.song.findUnique({
        where: { id: post.songId },
        select: { id: true, title: true, artist: true, coverUrl: true, genre: true, licensePrice: true },
      })
    : null;
  const postWithSong = {
    ...post,
    song: attachedSong ? { ...attachedSong, licensePrice: Number(attachedSong.licensePrice) } : null,
  };

  // Fan out a notification to every follower. Best-effort — never blocks the
  // post create response. Capped so a 100k-follower account doesn't trigger
  // a 100k-row insert in the request hot path; the cap is generous enough
  // for v1 and we can move to a queued worker once we hit it regularly.
  void (async () => {
    try {
      const FANOUT_CAP = 5000;
      const followers = await prisma.userFollow.findMany({
        where: { followingId: session.user.id },
        select: { followerId: true },
        take: FANOUT_CAP,
      });
      const authorName = post.author.name ?? "An artist you follow";
      const snippet = post.body.length > 140 ? `${post.body.slice(0, 140)}…` : post.body;
      const studioUsername = post.author.studio?.username;
      await Promise.all(
        followers.map((f) =>
          enqueueNotification({
            userId: f.followerId,
            type: "FOLLOWED_POST",
            title: `${authorName} posted`,
            body: snippet,
            metadata: {
              postId: post.id,
              authorId: post.author.id,
              authorStudio: studioUsername,
            },
          }),
        ),
      );
    } catch (err) {
      console.warn("[posts:create] follower fanout failed", err);
    }
  })();

  return NextResponse.json({ post: postWithSong }, { status: 201 });
}
