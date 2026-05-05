"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import MuxPlayer from "@mux/mux-player-react/lazy";
import type MuxPlayerElement from "@mux/mux-player";
import { usePlayer } from "@/contexts/PlayerContext";
import { getStreamUrl } from "@/lib/audioStream";
import { linkifyBody } from "@/lib/linkifyBody";

export interface PostCardProps {
  id: string;
  body: string;
  imageUrl?: string | null;
  muxPlaybackId?: string | null;
  videoStatus: "NONE" | "UPLOADING" | "PROCESSING" | "READY" | "FAILED";
  videoAspectRatio?: string | null;
  song?: {
    id: string;
    title: string;
    artist: string;
    coverUrl: string | null;
    genre: string | null;
    licensePrice: number;
  } | null;
  createdAt: string | Date;
  author: {
    id: string;
    name: string | null;
    image: string | null;
    role?: string;
    isVerified?: boolean;
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [shared, setShared] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(props.body);
  const [body, setBody] = useState(props.body);
  const [showMenu, setShowMenu] = useState(false);
  const [moderationMsg, setModerationMsg] = useState<string | null>(null);
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const [reportPickerOpen, setReportPickerOpen] = useState(false);
  const [videoStatus, setVideoStatus] = useState(props.videoStatus);
  const [muxPlaybackId, setMuxPlaybackId] = useState(props.muxPlaybackId);
  const [videoAspectRatio, setVideoAspectRatio] = useState(props.videoAspectRatio);
  const [pollExhausted, setPollExhausted] = useState(false);
  const [pollEpoch, setPollEpoch] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll the post API while the video is uploading/processing so the user
  // sees the player auto-appear without having to refresh. Stops once the
  // video is READY/FAILED or the component unmounts. Gives up after 5
  // minutes; the user can hit "Check again" to start a fresh poll cycle.
  useEffect(() => {
    if (videoStatus !== "UPLOADING" && videoStatus !== "PROCESSING") return;
    setPollExhausted(false);
    let elapsedMs = 0;
    const intervalMs = 4000;
    const giveUpAfterMs = 5 * 60 * 1000;
    pollRef.current = setInterval(async () => {
      elapsedMs += intervalMs;
      if (elapsedMs > giveUpAfterMs) {
        if (pollRef.current) clearInterval(pollRef.current);
        setPollExhausted(true);
        return;
      }
      try {
        const res = await fetch(`/api/posts/${props.id}`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          videoStatus?: PostCardProps["videoStatus"];
          muxPlaybackId?: string | null;
          videoAspectRatio?: string | null;
        };
        if (data.videoStatus) setVideoStatus(data.videoStatus);
        if (data.muxPlaybackId) setMuxPlaybackId(data.muxPlaybackId);
        if (data.videoAspectRatio) setVideoAspectRatio(data.videoAspectRatio);
        if (data.videoStatus === "READY" || data.videoStatus === "FAILED") {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        /* transient — keep polling */
      }
    }, intervalMs);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [props.id, videoStatus, pollEpoch]);

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
    setBusy(true);
    setConfirmingDelete(false);
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

  async function handleSaveEdit() {
    const next = editBody.trim();
    if (!next || next === body || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/posts/${props.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: next }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Save failed.");
      }
      setBody(next);
      setEditing(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmBlock() {
    setConfirmingBlock(false);
    try {
      const res = await fetch(`/api/users/${props.author.id}/block`, { method: "POST" });
      if (!res.ok) throw new Error();
      setDeleted(true); // sweep this card out optimistically
      props.onDeleted?.(props.id);
    } catch {
      setModerationMsg("Couldn't block — try again.");
    }
  }

  async function submitReport(reason: "SPAM" | "ABUSE" | "IMPERSONATION" | "NSFW" | "OTHER") {
    setReportPickerOpen(false);
    try {
      const res = await fetch(`/api/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: props.id, reportedUserId: props.author.id, reason }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Report failed");
      setModerationMsg("Reported — thanks. Moderators will review it.");
    } catch (err) {
      setModerationMsg(err instanceof Error ? err.message : "Couldn't send report.");
    }
  }

  async function handleShare() {
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/post/${props.id}`;
    const shareData = {
      title: `${props.author.name ?? "Post"} on Epic Music Space`,
      text: props.body.slice(0, 140),
      url,
    };
    // Prefer the native Web Share API (mobile + Safari) — falls back to
    // clipboard with a "copied" toast.
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        /* user cancelled — fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 1800);
    } catch {
      /* clipboard unavailable */
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
            <p className="flex items-center gap-1 text-sm font-bold group-hover:underline">
              <span>{props.author.name ?? "User"}</span>
              {props.author.isVerified && (
                <svg
                  aria-label="Verified"
                  role="img"
                  viewBox="0 0 24 24"
                  className="h-4 w-4 flex-shrink-0 text-cyan-300"
                  fill="currentColor"
                >
                  <path d="M12 2 9.4 4.5 6 4l-.5 3.4L2 9.5l1.7 3-1.7 3L5.5 17l.5 3.4L9.4 20 12 22l2.6-2.5 3.4.5.5-3.4 3.5-1.5-1.7-3 1.7-3-3.5-2 -.5-3.4-3.4.5L12 2Zm-1.2 13.5L7 11.7l1.4-1.4 2.4 2.4 5-5L17.2 9l-6.4 6.5Z" />
                </svg>
              )}
            </p>
            <p className="text-xs text-white/40">
              {props.author.studio?.username ? `@${props.author.studio.username} · ` : ""}
              {formatRelative(props.createdAt)}
            </p>
          </div>
        </Link>
        {!props.isOwner && (
          <div className="relative ml-auto">
            {showMenu ? (
              <button
                type="button"
                onClick={() => setShowMenu(false)}
                className="rounded-lg border border-white/10 px-2 py-1 text-xs text-white/40 hover:bg-white/10 hover:text-white/80"
                aria-label="Post actions"
                aria-haspopup="menu"
                aria-expanded="true"
              >
                ⋯
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowMenu(true)}
                className="rounded-lg border border-white/10 px-2 py-1 text-xs text-white/40 hover:bg-white/10 hover:text-white/80"
                aria-label="Post actions"
                aria-haspopup="menu"
                aria-expanded="false"
              >
                ⋯
              </button>
            )}
            {showMenu && (
              <div
                role="menu"
                className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border border-white/10 bg-[#15151c] shadow-xl"
                onMouseLeave={() => setShowMenu(false)}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowMenu(false);
                    setReportPickerOpen(true);
                  }}
                  className="block w-full px-3 py-2 text-left text-xs text-white/80 hover:bg-white/5"
                >
                  🚩 Report post
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowMenu(false);
                    setConfirmingBlock(true);
                  }}
                  className="block w-full px-3 py-2 text-left text-xs text-red-300 hover:bg-red-500/10"
                >
                  🚫 Block {props.author.name ?? "user"}
                </button>
              </div>
            )}
          </div>
        )}
        {props.isOwner && (
          <div className="ml-auto flex items-center gap-1.5">
            {confirmingDelete ? (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={busy}
                  className="rounded-lg border border-white/10 px-2 py-1 text-xs text-white/55 hover:bg-white/8"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={busy}
                  className="rounded-lg border border-red-500/40 bg-red-500/15 px-2 py-1 text-xs font-semibold text-red-200 hover:bg-red-500/25"
                >
                  {busy ? "Deleting…" : "Delete"}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(true);
                    setEditBody(body);
                  }}
                  disabled={busy || editing}
                  className="rounded-lg border border-white/10 px-2 py-1 text-xs text-white/55 hover:bg-white/10 hover:text-white/80"
                  aria-label="Edit post"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={busy}
                  className="rounded-lg border border-white/10 px-2 py-1 text-xs text-white/40 hover:bg-white/10 hover:text-white/80"
                  aria-label="Delete post"
                >
                  ⋯
                </button>
              </>
            )}
          </div>
        )}
      </header>

      {editing ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            rows={Math.min(8, Math.max(3, editBody.split("\n").length))}
            maxLength={2000}
            aria-label="Edit post body"
            placeholder="Edit your post…"
            className="w-full resize-y rounded-xl border border-white/10 bg-white/4 px-3 py-2 text-sm text-white focus:border-brand-500/60 focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setEditBody(body);
              }}
              disabled={busy}
              className="rounded-lg border border-white/15 px-3 py-1 text-xs text-white/65 hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={busy || !editBody.trim() || editBody.trim() === body}
              className="rounded-lg bg-brand-500 px-3 py-1 text-xs font-bold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : body ? (
        <p className="mt-3 whitespace-pre-wrap text-sm text-white/85">{linkifyBody(body)}</p>
      ) : null}

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

      {props.song && <AttachedSongCard song={props.song} />}

      {videoStatus !== "NONE" && (
        <div className="mt-3 overflow-hidden rounded-xl border border-white/8 bg-black">
          {videoStatus === "READY" && muxPlaybackId ? (
            <AutoplayingMuxPlayer
              playbackId={muxPlaybackId}
              aspectRatio={videoAspectRatio?.replace(":", "/") ?? "16/9"}
            />
          ) : videoStatus === "FAILED" ? (
            <div className="flex aspect-video items-center justify-center text-sm text-red-300">
              Video failed to process.
            </div>
          ) : (
            <div className="flex aspect-video items-center justify-center text-sm text-white/50">
              <div className="text-center">
                {pollExhausted ? (
                  <>
                    <div className="mb-2 text-2xl" aria-hidden>⏱️</div>
                    <p>Still encoding — taking longer than usual.</p>
                    <button
                      type="button"
                      onClick={() => setPollEpoch((n) => n + 1)}
                      className="mt-3 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10"
                    >
                      Check again
                    </button>
                  </>
                ) : (
                  <>
                    <div className="mb-2 inline-block h-6 w-6 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    <p>Encoding video…</p>
                    <p className="mt-1 text-xs text-white/30">It&apos;ll appear here automatically when ready.</p>
                  </>
                )}
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
        <button
          type="button"
          onClick={handleShare}
          className="ml-auto flex items-center gap-1.5 rounded-lg px-2 py-1 text-white/55 hover:text-white"
          aria-label="Share post"
        >
          <span aria-hidden>{shared ? "✓" : "↗"}</span>
          <span className="text-xs">{shared ? "Copied" : "Share"}</span>
        </button>
      </footer>

      {confirmingBlock && (
        <div
          role="alertdialog"
          aria-label="Confirm block"
          className="mt-3 rounded-xl border border-red-500/30 bg-red-500/8 p-3"
        >
          <p className="text-xs text-white/85">
            Block <strong>{props.author.name ?? "this user"}</strong>? You won&apos;t see
            their posts and they can&apos;t interact with yours.
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmingBlock(false)}
              className="rounded-lg border border-white/15 px-3 py-1 text-xs text-white/65 hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmBlock}
              className="rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-1 text-xs font-bold text-red-200 hover:bg-red-500/25"
            >
              Block
            </button>
          </div>
        </div>
      )}

      {reportPickerOpen && (
        <div
          role="dialog"
          aria-label="Report post"
          className="mt-3 rounded-xl border border-white/10 bg-[#15151c] p-3"
        >
          <p className="mb-2 text-xs font-semibold text-white/80">Why are you reporting this?</p>
          <div className="flex flex-wrap gap-2">
            {(["SPAM", "ABUSE", "IMPERSONATION", "NSFW", "OTHER"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => submitReport(r)}
                className="rounded-full border border-white/15 bg-white/4 px-3 py-1 text-[11px] font-bold text-white/80 hover:bg-white/8"
              >
                {r}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setReportPickerOpen(false)}
              className="ml-auto rounded-full border border-transparent px-3 py-1 text-[11px] text-white/45 hover:text-white/80"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {moderationMsg && (
        <p
          role="status"
          className="mt-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/65"
        >
          {moderationMsg}
        </p>
      )}
    </article>
  );
}

function AttachedSongCard({
  song,
}: {
  song: NonNullable<PostCardProps["song"]>;
}) {
  const player = usePlayer();
  const isCurrent = player.currentSong?.id === song.id;
  const playing = isCurrent && player.isPlaying;

  function onClick() {
    if (isCurrent) {
      player.togglePlay();
      return;
    }
    player.playSong({
      id: song.id,
      title: song.title,
      artist: song.artist,
      audioUrl: getStreamUrl(song.id),
      coverUrl: song.coverUrl,
    });
  }

  return (
    <Link
      href={`/track/${song.id}`}
      className="mt-3 flex items-center gap-3 rounded-xl border border-white/10 bg-gradient-to-r from-brand-500/8 to-accent-500/4 p-3 transition hover:border-brand-500/35 hover:from-brand-500/12"
    >
      <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-brand-900">
        {song.coverUrl ? (
          <Image src={song.coverUrl} alt="" fill unoptimized className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xl">🎵</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-brand-400">Track</p>
        <p className="truncate text-sm font-bold">{song.title}</p>
        <p className="truncate text-xs text-white/55">
          {song.artist}
          {song.genre ? <> · {song.genre}</> : null}
        </p>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        }}
        aria-label={playing ? `Pause ${song.title}` : `Play ${song.title}`}
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-white shadow-lg transition hover:scale-105 ${
          playing
            ? "bg-accent-500 shadow-accent-500/30"
            : "bg-brand-500 shadow-brand-500/30"
        }`}
      >
        {playing ? (
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        ) : (
          <svg className="ml-0.5 h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
    </Link>
  );
}

/**
 * MuxPlayer wrapper that mutes + autoplays when the video scrolls into the
 * viewport, and pauses when it leaves. Only one autoplaying player runs at
 * a time across the page (controlled by a window-scoped registry) so a
 * fast-scrolling user doesn't end up with three videos racing each other.
 */
function AutoplayingMuxPlayer({
  playbackId,
  aspectRatio,
}: {
  playbackId: string;
  aspectRatio: string;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<MuxPlayerElement | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [muted, setMuted] = useState(true);
  // moderation menu state lives on the AutoplayingMuxPlayer's parent; see
  // the non-owner ⋯ menu below for block/report wiring.

  function toggleMute(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const player = playerRef.current;
    if (!player) return;
    const next = !muted;
    player.muted = next;
    setMuted(next);
    setHasInteracted(true);
  }

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const player = playerRef.current;
        if (!player) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          // Pause any other autoplaying player on the page first so we
          // never run two simultaneously.
          const w = window as unknown as { __emsActiveVideo?: MuxPlayerElement };
          if (w.__emsActiveVideo && w.__emsActiveVideo !== player) {
            try {
              w.__emsActiveVideo.pause();
            } catch {
              /* ignore */
            }
          }
          w.__emsActiveVideo = player;
          if (!hasInteracted) player.muted = true;
          void Promise.resolve(player.play()).catch(() => {
            /* autoplay blocked — surface no error, user can tap play */
          });
        } else {
          try {
            player.pause();
          } catch {
            /* ignore */
          }
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasInteracted]);

  return (
    <div
      ref={wrapRef}
      className="relative"
      onPointerDown={() => setHasInteracted(true)}
    >
      <MuxPlayer
        ref={playerRef}
        playbackId={playbackId}
        streamType="on-demand"
        accentColor="#6C5CE7"
        // Start muted so autoplay is allowed; users tap to unmute. preload
        // metadata only so we don't start downloading bytes for cards the
        // user scrolls past quickly.
        muted
        playsInline
        preload="metadata"
        style={{
          aspectRatio,
          width: "100%",
        }}
      />
      {/* Mute/unmute indicator — sits over the corner so it's always
          tappable on mobile without fighting the Mux controls bar. */}
      <button
        type="button"
        onClick={toggleMute}
        aria-label={muted ? "Unmute video" : "Mute video"}
        className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white shadow-lg backdrop-blur transition hover:bg-black/80"
      >
        {muted ? (
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z" />
          </svg>
        ) : (
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
          </svg>
        )}
      </button>
    </div>
  );
}
