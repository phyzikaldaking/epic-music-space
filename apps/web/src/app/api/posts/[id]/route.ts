import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMuxClient } from "@/lib/mux";

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
