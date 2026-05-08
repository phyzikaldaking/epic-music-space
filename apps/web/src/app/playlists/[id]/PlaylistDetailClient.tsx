"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePlayer } from "@/contexts/PlayerContext";

type Owner = {
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
};

type TrackItem = {
  id: string;
  position: number;
  addedAt: string;
  song: {
    id: string;
    title: string;
    artist: string;
    coverUrl: string | null;
    streamUrl: string;
  };
};

type PlaylistHeader = {
  id: string;
  name: string;
  description: string | null;
  coverUrl: string | null;
  isPublic: boolean;
  shareToken: string | null;
  isOwner: boolean;
  owner: Owner | null;
};

export default function PlaylistDetailClient({
  playlist,
  tracks: initialTracks,
}: {
  playlist: PlaylistHeader;
  tracks: TrackItem[];
}) {
  const router = useRouter();
  const player = usePlayer();
  const [tracks, setTracks] = useState(initialTracks);
  const [isPublic, setIsPublic] = useState(playlist.isPublic);
  const [shareToken, setShareToken] = useState(playlist.shareToken);
  const [shareBusy, setShareBusy] = useState(false);
  const [copyConfirm, setCopyConfirm] = useState(false);
  const [, startTransition] = useTransition();

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined" || !shareToken) return null;
    return `${window.location.origin}/playlists/${playlist.id}`;
  }, [shareToken, playlist.id]);

  function playFrom(index: number) {
    const head = tracks[index];
    if (!head) return;
    player.playSong({
      id: head.song.id,
      title: head.song.title,
      artist: head.song.artist,
      audioUrl: head.song.streamUrl,
      coverUrl: head.song.coverUrl,
    });
    for (let i = index + 1; i < tracks.length; i++) {
      const t = tracks[i];
      player.addToQueue({
        id: t.song.id,
        title: t.song.title,
        artist: t.song.artist,
        audioUrl: t.song.streamUrl,
        coverUrl: t.song.coverUrl,
      });
    }
  }

  async function toggleShare(next: boolean) {
    setShareBusy(true);
    try {
      const res = await fetch(`/api/playlists/${playlist.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: next }),
      });
      if (!res.ok) return;
      const body = (await res.json()) as {
        isPublic: boolean;
        shareToken: string | null;
      };
      setIsPublic(body.isPublic);
      setShareToken(body.shareToken);
    } finally {
      setShareBusy(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyConfirm(true);
      setTimeout(() => setCopyConfirm(false), 1800);
    } catch {
      // Older browsers — fall back to a prompt the user can copy manually.
      window.prompt("Copy this link", shareUrl);
    }
  }

  async function removeTrack(trackId: string) {
    const before = tracks;
    setTracks((prev) => prev.filter((t) => t.id !== trackId));
    const res = await fetch(
      `/api/playlists/${playlist.id}/tracks/${trackId}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      setTracks(before);
    }
  }

  async function deletePlaylist() {
    if (!confirm("Delete this playlist? This can't be undone.")) return;
    const res = await fetch(`/api/playlists/${playlist.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      startTransition(() => {
        router.push("/playlists");
        router.refresh();
      });
    }
  }

  return (
    <div>
      <header className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-end">
        <div className="aspect-square w-full max-w-[220px] shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600/30 to-fuchsia-600/30 shadow-xl">
          {playlist.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={playlist.coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-7xl opacity-70" aria-hidden>
              🎵
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-widest text-white/45">
            Playlist
          </p>
          <h1 className="mt-1 break-words text-3xl font-extrabold text-gradient-ems sm:text-4xl">
            {playlist.name}
          </h1>
          {playlist.description && (
            <p className="mt-2 max-w-2xl text-sm text-white/70">
              {playlist.description}
            </p>
          )}
          <p className="mt-3 text-xs text-white/45">
            {playlist.owner && (
              <>
                By{" "}
                {playlist.owner.username ? (
                  <Link
                    href={`/u/${playlist.owner.username}`}
                    className="font-semibold text-white/75 hover:text-white"
                  >
                    {playlist.owner.name ?? playlist.owner.username}
                  </Link>
                ) : (
                  <span className="font-semibold text-white/75">
                    {playlist.owner.name ?? "—"}
                  </span>
                )}
                {" · "}
              </>
            )}
            {tracks.length} {tracks.length === 1 ? "track" : "tracks"}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => playFrom(0)}
              disabled={tracks.length === 0}
              className="rounded-xl bg-brand-500 px-5 py-2 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-50"
            >
              ▶ Play
            </button>

            {playlist.isOwner && (
              <>
                <button
                  type="button"
                  onClick={() => toggleShare(!isPublic)}
                  disabled={shareBusy}
                  className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white/85 transition hover:bg-white/5 disabled:opacity-50"
                >
                  {isPublic ? "🔓 Public" : "🔒 Private"}
                </button>
                {isPublic && shareUrl && (
                  <button
                    type="button"
                    onClick={copyLink}
                    className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white/85 transition hover:bg-white/5"
                  >
                    {copyConfirm ? "✓ Copied" : "Copy link"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={deletePlaylist}
                  className="ml-auto rounded-xl border border-rose-400/30 px-4 py-2 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/10"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {tracks.length === 0 ? (
        <div className="rounded-2xl border border-white/10 studio-faceplate p-10 text-center">
          <p className="mb-3 text-4xl" aria-hidden>📀</p>
          <p className="text-sm font-semibold text-white/85">
            No tracks yet.
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-white/45">
            Open any track and use “Add to playlist” to drop it in here.
          </p>
        </div>
      ) : (
        <ol className="overflow-hidden rounded-2xl border border-white/10 studio-faceplate">
          {tracks.map((t, i) => (
            <li
              key={t.id}
              className="flex items-center gap-3 border-b border-white/5 px-3 py-2 last:border-b-0 hover:bg-white/[0.03]"
            >
              <button
                type="button"
                onClick={() => playFrom(i)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-sm hover:bg-brand-500 hover:text-white"
                aria-label={`Play ${t.song.title}`}
              >
                ▶
              </button>
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-white/5">
                {t.song.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.song.coverUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-base opacity-50" aria-hidden>
                    🎵
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/songs/${t.song.id}`}
                  className="block truncate text-sm font-semibold text-white/90 hover:text-white"
                >
                  {t.song.title}
                </Link>
                <p className="truncate text-xs text-white/50">{t.song.artist}</p>
              </div>
              {playlist.isOwner && (
                <button
                  type="button"
                  onClick={() => removeTrack(t.id)}
                  className="shrink-0 rounded-lg px-2 py-1 text-xs text-white/45 hover:bg-white/5 hover:text-rose-300"
                  aria-label={`Remove ${t.song.title}`}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
