import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import PostCard from "@/components/PostCard";
import CommentThread from "./CommentThread";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const post = await prisma.post.findUnique({
    where: { id },
    select: { body: true, author: { select: { name: true } } },
  });
  if (!post) return { title: "Post not found" };
  const snippet = post.body.slice(0, 140);
  const title = `${post.author.name ?? "Post"} — Epic Music Space`;
  return {
    title,
    description: snippet,
    openGraph: { title, description: snippet, type: "article" },
    twitter: { card: "summary_large_image", title, description: snippet },
  };
}

export default async function PostDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await auth();
  const viewerId = session?.user?.id ?? null;

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

  if (!post || !post.isPublished) notFound();

  const likedByMe = viewerId
    ? (post as { likes?: unknown[] }).likes?.length === 1
    : false;

  const attachedSong = post.songId
    ? await prisma.song.findUnique({
        where: { id: post.songId },
        select: { id: true, title: true, artist: true, coverUrl: true, genre: true, licensePrice: true },
      })
    : null;
  const song = attachedSong
    ? {
        id: attachedSong.id,
        title: attachedSong.title,
        artist: attachedSong.artist,
        coverUrl: attachedSong.coverUrl,
        genre: attachedSong.genre,
        licensePrice: Number(attachedSong.licensePrice),
      }
    : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-5">
      <PostCard
        id={post.id}
        body={post.body}
        imageUrl={post.imageUrl}
        muxPlaybackId={post.muxPlaybackId}
        videoStatus={post.videoStatus}
        videoAspectRatio={post.videoAspectRatio}
        song={song}
        createdAt={post.createdAt.toISOString()}
        author={post.author}
        likeCount={post._count.likes}
        commentCount={post._count.comments}
        likedByMe={!!likedByMe}
        isOwner={viewerId === post.authorId}
      />
      <CommentThread postId={post.id} viewerId={viewerId} />
    </div>
  );
}
