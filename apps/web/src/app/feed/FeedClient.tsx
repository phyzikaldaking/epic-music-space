"use client";

import { useCallback, useEffect, useState } from "react";
import PostComposer from "@/components/PostComposer";
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
  // Prisma serialises Decimal columns to strings — coerce any licensePrice
  // to a number so the PostCard can render it without runtime gymnastics.
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

export default function FeedClient({
  initialMode,
  viewerId,
}: {
  initialMode: "all" | "following";
  viewerId: string | null;
}) {
  const [mode, setMode] = useState<"all" | "following">(initialMode);
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
        const params = new URLSearchParams({ limit: "20" });
        if (mode === "following") params.set("following", "1");
        if (!reset && cursor) params.set("cursor", cursor);
        const res = await fetch(`/api/posts?${params.toString()}`);
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? "Could not load feed.");
        }
        const data = (await res.json()) as { posts: RawPost[]; nextCursor: string | null };
        const mapped = data.posts.map(mapPost);
        setPosts((prev) => (reset ? mapped : [...prev, ...mapped]));
        setCursor(data.nextCursor);
        setDone(!data.nextCursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load feed.");
      } finally {
        setLoading(false);
      }
    },
    [mode, cursor, loading],
  );

  useEffect(() => {
    setPosts([]);
    setCursor(null);
    setDone(false);
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function handlePosted() {
    setPosts([]);
    setCursor(null);
    setDone(false);
    void load(true);
  }

  function handleDeleted(id: string) {
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div className="space-y-5">
      {viewerId ? (
        <PostComposer onPosted={handlePosted} />
      ) : (
        <div className="glass rounded-2xl p-4 text-center text-sm text-white/60">
          <a href="/auth/signin?callbackUrl=/feed" className="text-brand-400 hover:underline">
            Sign in
          </a>{" "}
          to post and react.
        </div>
      )}

      <div className="flex gap-2 text-sm">
        <button
          type="button"
          onClick={() => setMode("all")}
          className={`rounded-full px-4 py-1.5 transition ${
            mode === "all"
              ? "bg-brand-500 text-white"
              : "border border-white/10 text-white/60 hover:bg-white/5"
          }`}
        >
          For you
        </button>
        <button
          type="button"
          onClick={() => viewerId && setMode("following")}
          disabled={!viewerId}
          className={`rounded-full px-4 py-1.5 transition ${
            mode === "following"
              ? "bg-brand-500 text-white"
              : "border border-white/10 text-white/60 hover:bg-white/5 disabled:opacity-30"
          }`}
        >
          Following
        </button>
      </div>

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {posts.length === 0 && !loading && !error && (
        <div className="glass rounded-2xl p-8 text-center text-sm text-white/50">
          {mode === "following"
            ? "Follow artists to see their posts here."
            : "No posts yet. Be the first."}
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
