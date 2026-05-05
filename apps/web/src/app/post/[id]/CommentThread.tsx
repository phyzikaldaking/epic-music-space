"use client";

import { useEffect, useState } from "react";
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

export default function CommentThread({
  postId,
  viewerId,
}: {
  postId: string;
  viewerId: string | null;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/posts/${postId}/comments`);
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { comments: Comment[]; nextCursor: string | null };
        if (!cancelled) {
          setComments(data.comments);
          setCursor(data.nextCursor);
        }
      } catch {
        if (!cancelled) setError("Could not load comments.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [postId]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/posts/${postId}/comments?cursor=${cursor}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { comments: Comment[]; nextCursor: string | null };
      setComments((prev) => [...prev, ...data.comments]);
      setCursor(data.nextCursor);
    } catch {
      setError("Could not load more comments.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function submit() {
    const trimmed = body.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Could not post comment.");
      }
      const data = (await res.json()) as { comment: Comment };
      setComments((prev) => [...prev, data.comment]);
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="glass rounded-2xl p-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-white/50">
        Comments
      </h2>

      {loading ? (
        <p className="text-sm text-white/40">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-white/40">Be the first to comment.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => {
            const href = c.author.studio?.username
              ? `/studio/${c.author.studio.username}`
              : "#";
            return (
              <li key={c.id} className="flex gap-3">
                <Link href={href} className="flex-shrink-0">
                  <div className="h-8 w-8 overflow-hidden rounded-full bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center text-sm">
                    {c.author.image ? (
                      <Image
                        src={c.author.image}
                        alt=""
                        width={32}
                        height={32}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      "🎤"
                    )}
                  </div>
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <Link href={href} className="font-bold hover:underline">
                      {c.author.name ?? "User"}
                    </Link>{" "}
                    <span className="text-xs text-white/30">
                      {new Date(c.createdAt).toLocaleString()}
                    </span>
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-white/80">{c.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {cursor && !loading && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-3 w-full rounded-xl border border-white/10 bg-white/4 py-2 text-xs font-semibold text-white/60 hover:bg-white/8 disabled:opacity-50"
        >
          {loadingMore ? "Loading…" : "Load more comments"}
        </button>
      )}

      {viewerId ? (
        <div className="mt-4 space-y-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment…"
            rows={2}
            maxLength={1000}
            className="w-full resize-none rounded-xl border border-white/10 bg-white/4 px-3 py-2 text-sm placeholder-white/30 focus:border-brand-500/60 focus:outline-none"
          />
          {error && <p className="text-xs text-red-300">{error}</p>}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={submit}
              disabled={busy || !body.trim()}
              className="rounded-xl bg-brand-500 px-4 py-1.5 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-40"
            >
              {busy ? "Posting…" : "Comment"}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-white/40">
          <Link href="/auth/signin" className="text-brand-400 hover:underline">
            Sign in
          </Link>{" "}
          to comment.
        </p>
      )}
    </section>
  );
}
