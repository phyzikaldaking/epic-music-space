"use client";

import { useState } from "react";
import Image from "next/image";

interface MySong {
  id: string;
  title: string;
  coverUrl: string | null;
}

interface Suggestion {
  songId: string;
  songTitle: string;
  songCover: string | null;
  aiScore: number;
  username: string | null;
  artistName: string | null;
}

interface Props {
  mySongs: MySong[];
  suggestions: Suggestion[];
}

export default function VersusNewClient({ mySongs, suggestions }: Props) {
  const [songId, setSongId] = useState(mySongs[0]?.id ?? "");
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const [duration, setDuration] = useState(24);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function send() {
    if (!songId || !username.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/versus/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengerSongId: songId,
          opponentUsername: username.trim().toLowerCase(),
          message: message.trim() || undefined,
          durationHours: duration,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not send.");
      setSuccess(true);
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send.");
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <div className="rounded-2xl border border-emerald-500/35 bg-emerald-500/8 p-6">
        <p className="text-2xl">⚔️</p>
        <h2 className="mt-2 text-xl font-bold">Challenge sent</h2>
        <p className="mt-1 text-sm text-white/65">
          Opponent has 48 hours to pick a track and accept. We'll email you when they do.
        </p>
        <a
          href="/versus/inbox"
          className="mt-4 inline-block rounded-xl bg-brand-500 px-5 py-2 text-sm font-bold hover:bg-brand-600"
        >
          View my inbox →
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl p-5 space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-white/45">
            Your track
          </span>
          <select
            value={songId}
            onChange={(e) => setSongId(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
            aria-label="Your song"
          >
            {mySongs.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-white/45">
            Opponent username
          </span>
          <input
            type="text"
            placeholder="their @username"
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/^@/, ""))}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-white/45">
            Trash talk (optional)
          </span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Want to say something to your opponent? They'll see this in the challenge…"
            className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-white/45">
            Battle length
          </span>
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
          >
            <option value={6}>6 hours</option>
            <option value={24}>24 hours (default)</option>
            <option value={48}>48 hours</option>
            <option value={72}>3 days</option>
            <option value={168}>1 week</option>
          </select>
        </label>

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={send}
          disabled={busy || !songId || !username.trim()}
          className="w-full rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-40"
        >
          {busy ? "Sending…" : "Send challenge"}
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="rounded-2xl border border-white/8 bg-white/3 p-5">
          <h2 className="mb-1 text-sm font-bold uppercase tracking-widest text-white/55">
            Suggested matchups
          </h2>
          <p className="mb-4 text-xs text-white/40">
            Same genre, AI score within ±15 points of your top track. Closer score = closer battle.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {suggestions.map((s) => (
              <li key={s.songId}>
                <button
                  type="button"
                  onClick={() => s.username && setUsername(s.username)}
                  disabled={!s.username}
                  className="flex w-full items-center gap-3 rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-left hover:bg-white/8 disabled:opacity-40"
                >
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-brand-900">
                    {s.songCover ? (
                      <Image src={s.songCover} alt="" fill unoptimized className="object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-lg">🎵</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold">{s.artistName ?? s.username ?? "Artist"}</p>
                    <p className="truncate text-[10px] text-white/45">
                      {s.songTitle} · score {s.aiScore.toFixed(1)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
