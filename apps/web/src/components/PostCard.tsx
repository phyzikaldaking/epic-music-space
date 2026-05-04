"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import MuxPlayer from "@mux/mux-player-react/lazy";

export interface PostCardProps {
  id: string;
  body: string;
  imageUrl?: string | null;
  muxPlaybackId?: string | null;
  videoStatus: "NONE" | "UPLOADING" | "PROCESSING" | "READY" | "FAILED";
  videoAspectRatio?: string | null;
  createdAt: string | Date;
  author: {
    id: string;
    name: string | null;
    image: string | null;
    role?: string;
    studio?: { username: string } | null;
  };
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  isOwner?: boolean;
  onDeleted?: (id: string) => void;
}

function formatRelative(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return date.toLocaleDateString();
}

export default function PostCard(props: PostCardProps) {
  const [liked, setLiked] = useState(props.likedByMe);
  const [likes, setLikes] = useState(props.likeCount);
  const [busy, setBusy] = useState(false);
  const [deleted, setDeleted] = useState(false);

  const profileHref = props.author.studio?.username
    ? `/studio/${props.author.studio.username}`
    : `#`;

  async function toggleLike() {
    if (busy) return;
    setBusy(true);
    // optimistic
    const prevLiked = liked;
    const prevLikes = likes;
    setLiked(!liked);
    setLikes(liked ? likes - 1 : likes + 1);
    try {
      const res = await fetch(`/api/posts/${props.id}/like`, { method: "POST" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { liked: boolean; count: number };
      setLiked(data.liked);
      setLikes(data.count);
    } catch {
      setLiked(prevLiked);
      setLikes(prevLikes);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this post? This can't be undone.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/posts/${props.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setDeleted(true);
      props.onDeleted?.(props.id);
    } catch {
      alert("Could not delete. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (deleted) return null;

  return (
    <article className="glass rounded-2xl p-4">
      <header className="flex items-center gap-3">
        <Link href={profileHref} className="flex items-center gap-3 group">
          <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center text-base">
            {props.author.image ? (
              <Image
                src={props.author.image}
                alt={props.author.name ?? ""}
                width={40}
                height={40}
                className="h-full w-full object-cover"
              />
            ) : (
              "🎤"
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold group-hover:underline">
              {props.author.name ?? "User"}
            </p>
            <p className="text-xs text-white/40">
              {props.author.studio?.username ? `@${props.author.studio.username} · ` : ""}
              {formatRelative(props.createdAt)}
            </p>
          </div>
        </Link>
        {props.isOwner && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="ml-auto rounded-lg border border-white/10 px-2 py-1 text-xs text-white/40 hover:bg-white/10 hover:text-white/80"
            aria-label="Delete post"
          >
            ⋯
          </button>
        )}
      </header>

      {props.body && (
        <p className="mt-3 whitespace-pre-wrap text-sm text-white/85">{props.body}</p>
      )}

      {props.imageUrl && (
        <div className="mt-3 overflow-hidden rounded-xl border border-white/8">
          <Image
            src={props.imageUrl}
            alt=""
            width={800}
            height={600}
            unoptimized
            className="h-auto w-full object-contain"
          />
        </div>
      )}

      {props.videoStatus !== "NONE" && (
        <div className="mt-3 overflow-hidden rounded-xl border border-white/8 bg-black">
          {props.videoStatus === "READY" && props.muxPlaybackId ? (
            <MuxPlayer
              playbackId={props.muxPlaybackId}
              streamType="on-demand"
              accentColor="#6C5CE7"
              style={{
                aspectRatio: props.videoAspectRatio?.replace(":", "/") ?? "16/9",
                width: "100%",
              }}
            />
          ) : props.videoStatus === "FAILED" ? (
            <div className="flex aspect-video items-center justify-center text-sm text-red-300">
              Video failed to process.
            </div>
          ) : (
            <div className="flex aspect-video items-center justify-center text-sm text-white/50">
              <div className="text-center">
                <div className="mb-2 text-2xl">⏳</div>
                <p>Encoding video…</p>
                <p className="text-xs text-white/30 mt-1">Refresh in a few seconds.</p>
              </div>
            </div>
          )}
        </div>
      )}

      <footer className="mt-3 flex items-center gap-4 text-sm">
        <button
          type="button"
          onClick={toggleLike}
          disabled={busy}
          className={`flex items-center gap-1.5 rounded-lg px-2 py-1 transition ${
            liked ? "text-pink-400" : "text-white/55 hover:text-white"
          }`}
          aria-label={liked ? "Unlike" : "Like"}
        >
          <span>{liked ? "♥" : "♡"}</span>
          <span className="text-xs tabular-nums">{likes}</span>
        </button>
        <Link
          href={`/post/${props.id}`}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-white/55 hover:text-white"
        >
          <span>💬</span>
          <span className="text-xs tabular-nums">{props.commentCount}</span>
        </Link>
      </footer>
    </article>
  );
}
