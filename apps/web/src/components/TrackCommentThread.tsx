"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";

interface Comment {
  id: string;
  body: string;
  createdAt: string;
  author: {
    id: string;
    name: string | null;
    image: string | null;
    studio: { username: string } | null;
  };
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function TrackCommentThread({ songId }: { songId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadComments = useCallback(
    async (cursorId?: string) => {
      const url = `/api/tracks/${songId}/comments?limit=25${cursorId ? `&cursor=${cursorId}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = (await res.json()) as { comments: Comment[]; nextCursor: string | null };
      if (cursorId) {
        setComments((prev) => [...prev, ...data.comments]);
      } else {
        setComments(data.comments);
      }
      setCursor(data.nextCursor);
    },
    [songId],
  );

  useEffect(() => {
    setLoading(true);
    loadComments().finally(() => setLoading(false));
  }, [loadComments]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tracks/${songId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });
      const data = (await res.json()) as { comment?: Comment; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not post comment.");
        return;
      }
      if (data.comment) {
        setComments((prev) => [data.comment!, ...prev]);
        setBody("");
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="glass rounded-2xl p-5">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-white/50">
        Comments {comments.length > 0 && <span className="text-white/30">({comments.length})</span>}
      </h2>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="h-8 w-8 rounded-full bg-white/10" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-24 rounded bg-white/10" />
                <div className="h-3 w-full rounded bg-white/5" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {comments.length === 0 && (
            <p className="mb-4 text-sm text-white/30">No comments yet. Be the first to share your thoughts.</p>
          )}

          <div className="space-y-3 mb-4">
            {comments.map((c) => (
              <div key={c.id} className="flex gap-3 group">
                <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-brand-500 to-accent-500">
                  {c.author.image ? (
                    <Image src={c.author.image} alt="" width={32} height={32} className="object-cover" unoptimized />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-white">
                      {(c.author.name ?? "?")[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <Link
                      href={c.author.studio ? `/studio/${c.author.studio.username}` : "#"}
                      className="text-xs font-bold text-white/80 hover:text-accent-300 transition"
                    >
                      {c.author.name ?? "Anonymous"}
                    </Link>
                    <span className="text-[10px] text-white/25">{timeAgo(c.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-white/70 leading-relaxed">{c.body}</p>
                </div>
              </div>
            ))}
          </div>

          {cursor && (
            <button
              type="button"
              disabled={loadingMore}
              onClick={async () => {
                setLoadingMore(true);
                await loadComments(cursor);
                setLoadingMore(false);
              }}
              className="mb-4 w-full rounded-xl border border-white/10 bg-white/4 py-2 text-xs font-semibold text-white/50 hover:bg-white/8 disabled:opacity-50 transition"
            >
              {loadingMore ? "Loading..." : "Load more comments"}
            </button>
          )}
        </>
      )}

      {error && (
        <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 1000))}
          placeholder="Share your thoughts on this track..."
          rows={2}
          className="flex-1 resize-none rounded-xl border border-white/10 bg-white/4 px-3 py-2 text-sm text-white placeholder-white/25 focus:border-brand-500/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!body.trim() || busy}
          className="self-end rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-40"
        >
          {busy ? "..." : "Post"}
        </button>
      </form>
      <p className="mt-1 text-right text-[10px] text-white/20">{body.length}/1000</p>
    </section>
  );
}
