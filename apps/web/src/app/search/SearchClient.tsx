"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/contexts/PlayerContext";
import { getStreamUrl } from "@/lib/audioStream";

interface SongResult {
  id: string;
  title: string;
  artist: string;
  genre: string | null;
  coverUrl: string | null;
  streamUrl: string;
  licensePrice: number;
  bpm: number | null;
  key: string | null;
}

interface ArtistResult {
  username: string;
  level: number;
  bio: string | null;
  user: {
    id: string;
    name: string | null;
    image: string | null;
    role: string;
    connectChargesEnabled: boolean;
    connectPayoutsEnabled: boolean;
    _count: { followers: number; songs: number };
  };
}

interface SearchResponse {
  songs: SongResult[];
  artists: ArtistResult[];
}

export default function SearchClient({
  initialPromise,
}: {
  initialPromise: Promise<{ q?: string }>;
}) {
  const initial = use(initialPromise);
  const router = useRouter();
  const player = usePlayer();
  const [q, setQ] = useState(initial.q ?? "");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const trimmedQuery = useMemo(() => q.trim(), [q]);

  useEffect(() => {
    if (!trimmedQuery) {
      setResults(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmedQuery)}&limit=15`);
        if (!res.ok) throw new Error();
        const data = (await res.json()) as SearchResponse;
        if (!cancelled) setResults(data);
      } catch {
        if (!cancelled) setResults({ songs: [], artists: [] });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [trimmedQuery]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.replace(`/search?q=${encodeURIComponent(trimmedQuery)}`);
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="mb-8">
        <input
          type="search"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tracks, artists, genres…"
          className="w-full rounded-2xl border border-white/10 bg-white/4 px-5 py-3 text-base text-white placeholder-white/30 focus:border-brand-500/60 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
        />
      </form>

      {!trimmedQuery && (
        <p className="text-sm text-white/45">
          Start typing to search across tracks, artists, and genres.
        </p>
      )}

      {trimmedQuery && loading && results === null && (
        <p className="text-sm text-white/45">Searching…</p>
      )}

      {results && (
        <>
          <section className="mb-10">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-white/50">
              Tracks ({results.songs.length})
            </h2>
            {results.songs.length === 0 ? (
              <p className="text-sm text-white/40">No tracks match &ldquo;{trimmedQuery}&rdquo;.</p>
            ) : (
              <ul className="space-y-2">
                {results.songs.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/3 p-3 hover:bg-white/6"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        player.playSong({
                          id: s.id,
                          title: s.title,
                          artist: s.artist,
                          audioUrl: s.streamUrl,
                          coverUrl: s.coverUrl,
                        })
                      }
                      aria-label={`Play ${s.title}`}
                      className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-brand-900 hover:opacity-90"
                    >
                      {s.coverUrl ? (
                        <Image src={s.coverUrl} alt="" fill className="object-cover" unoptimized />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xl">🎵</div>
                      )}
                      <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100">
                        <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </span>
                    </button>
                    <Link href={`/track/${s.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{s.title}</p>
                      <p className="truncate text-xs text-white/45">
                        {s.artist}
                        {s.genre ? ` · ${s.genre}` : ""}
                        {s.bpm ? ` · ${s.bpm} BPM` : ""}
                      </p>
                    </Link>
                    <span className="text-sm font-bold text-brand-300 shrink-0">
                      ${s.licensePrice.toFixed(0)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-white/50">
              Artists ({results.artists.length})
            </h2>
            {results.artists.length === 0 ? (
              <p className="text-sm text-white/40">No artists match &ldquo;{trimmedQuery}&rdquo;.</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {results.artists.map((a) => (
                  <li key={a.username}>
                    <Link
                      href={`/studio/${a.username}`}
                      className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/3 p-3 hover:bg-white/6"
                    >
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center text-base">
                        {a.user.image ? (
                          <Image
                            src={a.user.image}
                            alt=""
                            width={48}
                            height={48}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          "🎤"
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">
                          {a.user.name ?? a.username}
                          {a.user.connectChargesEnabled && a.user.connectPayoutsEnabled && (
                            <span className="ml-1 text-sky-300" title="Verified artist">✓</span>
                          )}
                        </p>
                        <p className="truncate text-xs text-white/45">
                          @{a.username} · {a.user._count.followers} followers · {a.user._count.songs} tracks
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
