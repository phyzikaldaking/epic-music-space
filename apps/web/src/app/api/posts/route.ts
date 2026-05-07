import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { moderateLimiter, strictLimiter } from "@/lib/rateLimit";
import { isLikelyBot } from "@/lib/botCheck";
import { getMuxClient } from "@/lib/mux";
import { enqueueNotification } from "@/lib/queues";
import { validateTrustSafetyInput } from "@/lib/trustSafety";
import { readJsonBodyLimited, withRouteTimeout } from "@/lib/apiHardening";
import { shouldShedNonCriticalWork } from "@/lib/trafficShed";

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
  // ?tag=hiphop — filter posts whose body contains the hashtag (case-insensitive).
  // Trimmed and length-capped so a noisy client can't ship a 10KB regex.
  const tagRaw = url.searchParams.get("tag")?.trim().toLowerCase().slice(0, 50) ?? "";
  const tag = /^[a-z0-9_]+$/.test(tagRaw) ? tagRaw : "";

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

  // Filter out posts authored by anyone the viewer has blocked, plus anyone
  // who has blocked the viewer (defense in depth — blocked users shouldn't
  // be able to surface in either direction).
  let blockedAuthorIds: string[] = [];
  if (viewerId) {
    const [outgoing, incoming] = await Promise.all([
      prisma.userBlock.findMany({
        where: { blockerId: viewerId },
        select: { blockedId: true },
      }),
      prisma.userBlock.findMany({
        where: { blockedId: viewerId },
        select: { blockerId: true },
      }),
    ]);
    blockedAuthorIds = [
      ...outgoing.map((b) => b.blockedId),
      ...incoming.map((b) => b.blockerId),
    ];
  }

  const posts = await prisma.post.findMany({
    where: {
      isPublished: true,
      ...(authorId ? { authorId } : {}),
      ...(authorFilter ? { authorId: authorFilter } : {}),
      ...(tag ? { body: { contains: `#${tag}`, mode: "insensitive" } } : {}),
      ...(blockedAuthorIds.length ? { authorId: { notIn: blockedAuthorIds } } : {}),
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
          isVerified: true,
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

  // BotID gate before we accept body bytes / spend a Mux upload slot. Soft
  // fail (helper returns false on errors) so a flaky check can't lock real
  // users out.
  if (await isLikelyBot({ headers: req.headers })) {
    return NextResponse.json(
      { error: "Couldn't verify the request. Try again from a normal browser." },
      { status: 403 },
    );
  }

  const bodyResult = await readJsonBodyLimited<Record<string, unknown>>(req, {
    maxBytes: 32 * 1024,
  });
  if (!bodyResult.ok) return bodyResult.response;

  const raw = bodyResult.value;

  const parsed = createPostSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { body, imageUrl, songId, muxUploadId } = parsed.data;

  const trustSafety = validateTrustSafetyInput(body, imageUrl);
  if (!trustSafety.ok) {
    return NextResponse.json(
      { error: trustSafety.message, code: trustSafety.code },
      { status: 400 },
    );
  }

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
        const uploadResult = await withRouteTimeout("mux-upload-verify", 2500, async () =>
          mux.video.uploads.retrieve(muxUploadId),
        );
        if (!uploadResult.ok) return uploadResult.response;

        const upload = uploadResult.value;
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

  const postResult = await withRouteTimeout("post-create", 3500, async () =>
    prisma.post.create({
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
    }),
  );
  if (!postResult.ok) return postResult.response;

  const post = postResult.value;

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
  // post create response. Streamed in 1k-row pages so an artist with
  // 100k+ followers is no longer silently capped at 5k; each batch's
  // enqueues hit the BullMQ notification queue which a worker drains.
  void (async () => {
    try {
      if (await shouldShedNonCriticalWork()) {
        return;
      }

      const PAGE = 1000;
      const authorName = post.author.name ?? "An artist you follow";
      const snippet = post.body.length > 140 ? `${post.body.slice(0, 140)}…` : post.body;
      const studioUsername = post.author.studio?.username;
      let cursor: string | null = null;
      // Hard upper bound on iterations as a defensive break — 100 pages of
      // 1k = 100k followers per post, which is generous; any artist hitting
      // that ceiling can move to a true streaming worker.
      for (let page = 0; page < 100; page++) {
        const followers: { followerId: string }[] = await prisma.userFollow.findMany({
          where: { followingId: session.user.id },
          select: { followerId: true },
          orderBy: { followerId: "asc" },
          take: PAGE,
          ...(cursor ? { cursor: { followerId_followingId: { followerId: cursor, followingId: session.user.id } }, skip: 1 } : {}),
        });
        if (followers.length === 0) break;
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
        if (followers.length < PAGE) break;
        cursor = followers[followers.length - 1].followerId;
      }
    } catch (err) {
      console.warn("[posts:create] follower fanout failed", err);
    }
  })();

  return NextResponse.json({ post: postWithSong }, { status: 201 });
}
