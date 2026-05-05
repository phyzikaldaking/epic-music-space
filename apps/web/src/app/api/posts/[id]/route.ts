import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMuxClient } from "@/lib/mux";
import { strictLimiter } from "@/lib/rateLimit";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  const viewerId = session?.user?.id;

  const post = await prisma.post.findUnique({
    where: { id },
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

  if (!post || !post.isPublished) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Stitch in attached song (Post.songId is a column without a Prisma relation
  // declared, so we fetch it separately).
  const attachedSong = post.songId
    ? await prisma.song.findUnique({
        where: { id: post.songId },
        select: { id: true, title: true, artist: true, coverUrl: true, genre: true, licensePrice: true },
      })
    : null;

  return NextResponse.json({
    ...post,
    song: attachedSong ? { ...attachedSong, licensePrice: Number(attachedSong.licensePrice) } : null,
    likedByMe: viewerId ? (post as { likes?: unknown[] }).likes?.length === 1 : false,
    likes: undefined,
  });
}

const patchSchema = z.object({
  body: z.string().min(1).max(2000),
});

/**
 * PATCH /api/posts/[id] — edit your own post body. Author or admin only.
 * Media (image/video/song) is not editable — replace via delete+re-create.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await strictLimiter.consume(`post-edit:${session.user.id}:${id}`);
    await strictLimiter.consume(`post-edit:ip:${ip}`);
  } catch {
    return NextResponse.json(
      { error: "Editing too quickly." },
      { status: 429, headers: { "Retry-After": "30" } },
    );
  }

  const post = await prisma.post.findUnique({
    where: { id },
    select: { authorId: true },
  });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = post.authorId === session.user.id;
  const isAdmin = session.user.role === "ADMIN";
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const updated = await prisma.post.update({
    where: { id },
    data: { body: parsed.data.body },
    select: { id: true, body: true, updatedAt: true },
  });
  return NextResponse.json({ post: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const post = await prisma.post.findUnique({
    where: { id },
    select: { authorId: true, muxAssetId: true },
  });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = post.authorId === session.user.id;
  const isAdmin = session.user.role === "ADMIN";
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Best-effort: also delete the Mux asset to stop billing for it.
  if (post.muxAssetId) {
    const mux = getMuxClient();
    if (mux) {
      try {
        await mux.video.assets.delete(post.muxAssetId);
      } catch (err) {
        console.warn("[posts:delete] mux asset cleanup failed", err);
      }
    }
  }

  await prisma.post.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
