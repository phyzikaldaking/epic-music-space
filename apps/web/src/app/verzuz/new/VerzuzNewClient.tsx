"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Song {
  id: string;
  title: string;
  coverUrl: string | null;
  genre: string | null;
}

interface OpponentSong {
  id: string;
  title: string;
  coverUrl: string | null;
}

export default function VerzuzNewClient({ mySongs }: { mySongs: Song[] }) {
  const router = useRouter();
  const [opponentUsername, setOpponentUsername] = useState("");
  const [opponentLookupBusy, setOpponentLookupBusy] = useState(false);
  const [opponent, setOpponent] = useState<{
    id: string;
    name: string | null;
    songs: OpponentSong[];
  } | null>(null);
  const [theme, setTheme] = useState("");
  const [songsA, setSongsA] = useState<string[]>([]);
  const [songsB, setSongsB] = useState<string[]>([]);
  const [roundDuration, setRoundDuration] = useState(180);
  const [startsAtLocal, setStartsAtLocal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function findOpponent() {
    const username = opponentUsername.trim().replace(/^@/, "");
    if (!username) return;
    setOpponentLookupBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/by-username/${encodeURIComponent(username)}`);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Couldn't find that artist.");
      }
      const data = (await res.json()) as {
        user: { id: string; name: string | null };
        songs: OpponentSong[];
      };
      setOpponent({ id: data.user.id, name: data.user.name, songs: data.songs });
      setSongsB([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed.");
      setOpponent(null);
    } finally {
      setOpponentLookupBusy(false);
    }
  }

  function toggleA(id: string) {
    setSongsA((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 10 ? [...prev, id] : prev,
    );
  }
  function toggleB(id: string) {
    setSongsB((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 10 ? [...prev, id] : prev,
    );
  }

  function move(list: string[], from: number, to: number) {
    if (from === to) return list;
    if (from < 0 || from >= list.length) return list;
    if (to < 0 || to >= list.length) return list;
    const next = list.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  }

  function bumpA(id: string, dir: -1 | 1) {
    setSongsA((prev) => {
      const idx = prev.indexOf(id);
      if (idx < 0) return prev;
      return move(prev, idx, idx + dir);
    });
  }

  function bumpB(id: string, dir: -1 | 1) {
    setSongsB((prev) => {
      const idx = prev.indexOf(id);
      if (idx < 0) return prev;
      return move(prev, idx, idx + dir);
    });
  }

  const equalLength = songsA.length === songsB.length;
  const enoughSongs = songsA.length > 0 && songsB.length > 0;

  async function submit() {
    if (busy || !opponent || !enoughSongs || !equalLength) return;
    setBusy(true);
    setError(null);
    try {
      let startsAtIso: string | undefined;
      if (startsAtLocal.trim()) {
        const d = new Date(startsAtLocal);
        if (Number.isNaN(d.getTime())) throw new Error("Invalid start time.");
        startsAtIso = d.toISOString();
      }
      const res = await fetch("/api/verzuz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artistBId: opponent.id,
          theme: theme.trim() || undefined,
          songsA,
          songsB,
          roundDurationSec: roundDuration,
          startsAt: startsAtIso,
        }),
      });
      const data = (await res.json()) as { match?: { id: string }; error?: string };
      if (!res.ok || !data.match) throw new Error(data.error ?? "Couldn't create.");
      router.push(`/verzuz/${data.match.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/4 p-5">
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-white/55">
          Step 1 · Pick an opponent
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={opponentUsername}
            onChange={(e) => setOpponentUsername(e.target.value)}
            placeholder="@username"
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={findOpponent}
            disabled={opponentLookupBusy || !opponentUsername.trim()}
            className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {opponentLookupBusy ? "Looking…" : "Find"}
          </button>
        </div>
        {opponent && (
          <p className="mt-2 text-xs text-white/55">
            Locked in <strong>{opponent.name ?? opponentUsername}</strong> with{" "}
            {opponent.songs.length} active track{opponent.songs.length === 1 ? "" : "s"}.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/4 p-5">
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-white/55">
          Step 2 · Theme + format (optional)
        </p>
        <input
          type="text"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          placeholder='e.g. "Hip-hop legends" or "Producers cup"'
          maxLength={80}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
        />
        <label className="mt-3 block text-xs font-bold uppercase tracking-widest text-white/55">
          Start time (optional)
        </label>
        <input
          type="datetime-local"
          value={startsAtLocal}
          onChange={(e) => setStartsAtLocal(e.target.value)}
          className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
        />
        <label className="mt-3 block text-xs font-bold uppercase tracking-widest text-white/55">
          Round duration
        </label>
        <select
          value={roundDuration}
          onChange={(e) => setRoundDuration(Number(e.target.value))}
          className="mt-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
        >
          <option value={60}>1 minute</option>
          <option value={120}>2 minutes</option>
          <option value={180}>3 minutes (default)</option>
          <option value={300}>5 minutes</option>
          <option value={600}>10 minutes</option>
        </select>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/4 p-5">
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-white/55">
          Step 3 · Setlists ({songsA.length} vs {songsB.length}, max 10 each)
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-bold">Your setlist (A)</p>
            <ul className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-white/8 bg-black/30 p-2">
              {mySongs.map((s) => {
                const idx = songsA.indexOf(s.id);
                return (
                  <li key={s.id}>
                    <div
                      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-white/5 ${
                        idx >= 0 ? "bg-brand-500/15 text-white" : "text-white/65"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleA(s.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        aria-label={idx >= 0 ? `Remove ${s.title} from setlist A` : `Add ${s.title} to setlist A`}
                      >
                        <span className="w-5 text-center font-mono text-[10px] text-white/45">
                          {idx >= 0 ? idx + 1 : "·"}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{s.title}</span>
                        {s.genre && <span className="text-[10px] text-white/35">{s.genre}</span>}
                      </button>
                      {idx >= 0 && (
                        <div className="flex flex-shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => bumpA(s.id, -1)}
                            disabled={idx === 0}
                            className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-black text-white/65 hover:bg-white/10 disabled:opacity-30"
                            aria-label="Move up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => bumpA(s.id, 1)}
                            disabled={idx === songsA.length - 1}
                            className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-black text-white/65 hover:bg-white/10 disabled:opacity-30"
                            aria-label="Move down"
                          >
                            ↓
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-sm font-bold">
              {opponent ? `${opponent.name ?? "Opponent"}'s setlist (B)` : "Opponent's setlist (B)"}
            </p>
            {opponent ? (
              <ul className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-white/8 bg-black/30 p-2">
                {opponent.songs.length === 0 && (
                  <li className="px-2 py-1 text-xs text-white/45">
                    They don&apos;t have any active tracks yet.
                  </li>
                )}
                {opponent.songs.map((s) => {
                  const idx = songsB.indexOf(s.id);
                  return (
                    <li key={s.id}>
                      <div
                        className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-white/5 ${
                          idx >= 0 ? "bg-accent-500/15 text-white" : "text-white/65"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleB(s.id)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          aria-label={idx >= 0 ? `Remove ${s.title} from setlist B` : `Add ${s.title} to setlist B`}
                        >
                          <span className="w-5 text-center font-mono text-[10px] text-white/45">
                            {idx >= 0 ? idx + 1 : "·"}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{s.title}</span>
                        </button>
                        {idx >= 0 && (
                          <div className="flex flex-shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => bumpB(s.id, -1)}
                              disabled={idx === 0}
                              className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-black text-white/65 hover:bg-white/10 disabled:opacity-30"
                              aria-label="Move up"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => bumpB(s.id, 1)}
                              disabled={idx === songsB.length - 1}
                              className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-black text-white/65 hover:bg-white/10 disabled:opacity-30"
                              aria-label="Move down"
                            >
                              ↓
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-white/10 bg-black/30 p-4 text-xs text-white/45">
                Find an opponent above to load their catalog.
              </p>
            )}
          </div>
        </div>
        {!equalLength && enoughSongs && (
          <p className="mt-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200">
            Both setlists must be the same length. You: {songsA.length} · Them: {songsB.length}.
          </p>
        )}
      </section>

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={!opponent || !enoughSongs || !equalLength || busy}
        className="w-full rounded-2xl bg-gold-500 py-3 text-sm font-black uppercase tracking-widest text-[#0a0a0a] transition hover:bg-gold-400 disabled:opacity-40"
      >
        {busy ? "Staging…" : "Stage the Verzuz →"}
      </button>
    </div>
  );
}
