"use client";

import { useCallback, useEffect, useState } from "react";
import PostCard, { type PostCardProps } from "@/components/PostCard";

interface FeedPost extends Omit<PostCardProps, "onDeleted" | "isOwner"> {
  authorIdRaw: string;
}

interface RawPost {
  id: string;
  body: string;
  imageUrl: string | null;
  muxPlaybackId: string | null;
  videoStatus: PostCardProps["videoStatus"];
  videoAspectRatio: string | null;
  song: PostCardProps["song"];
  createdAt: string;
  authorId: string;
  author: PostCardProps["author"];
  _count: { likes: number; comments: number };
  likedByMe: boolean;
}

function mapPost(p: RawPost): FeedPost {
  const song = p.song
    ? {
        ...p.song,
        licensePrice:
          typeof p.song.licensePrice === "number"
            ? p.song.licensePrice
            : Number(p.song.licensePrice),
      }
    : null;
  return {
    id: p.id,
    body: p.body,
    imageUrl: p.imageUrl,
    muxPlaybackId: p.muxPlaybackId,
    videoStatus: p.videoStatus,
    videoAspectRatio: p.videoAspectRatio,
    song,
    createdAt: p.createdAt,
    author: p.author,
    likeCount: p._count.likes,
    commentCount: p._count.comments,
    likedByMe: p.likedByMe,
    authorIdRaw: p.authorId,
  };
}

export default function ExploreClient({
  tag,
  viewerId,
}: {
  tag: string;
  viewerId: string | null;
}) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (reset: boolean) => {
      if (loading) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ tag, limit: "20" });
        if (!reset && cursor) params.set("cursor", cursor);
        const res = await fetch(`/api/posts?${params.toString()}`);
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? "Could not load posts.");
        }
        const data = (await res.json()) as { posts: RawPost[]; nextCursor: string | null };
        const mapped = data.posts.map(mapPost);
        setPosts((prev) => (reset ? mapped : [...prev, ...mapped]));
        setCursor(data.nextCursor);
        setDone(!data.nextCursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load posts.");
      } finally {
        setLoading(false);
      }
    },
    [tag, cursor, loading],
  );

  useEffect(() => {
    setPosts([]);
    setCursor(null);
    setDone(false);
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tag]);

  function handleDeleted(id: string) {
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {posts.length === 0 && !loading && !error && (
        <div className="glass rounded-2xl p-8 text-center text-sm text-white/55">
          <p className="mb-3 text-4xl" aria-hidden>🏷️</p>
          <p className="font-semibold text-white/85">
            No posts yet for <span className="text-brand-400">#{tag}</span>
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-white/45">
            Be the first to use this hashtag — it&apos;ll show up here as soon
            as you do.
          </p>
        </div>
      )}

      {posts.map((p) => (
        <PostCard
          key={p.id}
          {...p}
          isOwner={viewerId === p.authorIdRaw}
          onDeleted={handleDeleted}
        />
      ))}

      {!done && posts.length > 0 && (
        <button
          type="button"
          onClick={() => load(false)}
          disabled={loading}
          className="w-full rounded-xl border border-white/10 bg-white/4 py-3 text-sm hover:bg-white/8 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
