"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

interface MySong {
  id: string;
  title: string;
  coverUrl: string | null;
  genre: string | null;
  bpm: number | null;
  aiScore: number;
}

interface Props {
  mySongs: MySong[];
  initialOpponentUsername: string;
}

const MIN_ROUNDS = 1;
const MAX_ROUNDS = 10;
const TIER_OPTIONS = [
  { value: "MAIN_EVENT", label: "Main event", desc: "Long-form 3-min rounds" },
  { value: "SPEED",      label: "Speed",      desc: "Quick 90-sec rounds" },
] as const;

export default function SendVerzuzChallengeForm({
  mySongs,
  initialOpponentUsername,
}: Props) {
  const router = useRouter();

  const [opponentUsername, setOpponentUsername] = useState(
    initialOpponentUsername.replace(/^@/, ""),
  );
  const [theme, setTheme] = useState("");
  const [tier, setTier] = useState<(typeof TIER_OPTIONS)[number]["value"]>("MAIN_EVENT");
  const roundDuration = 180;
  const [startsAtLocal, setStartsAtLocal] = useState(() => {
    // Default: 30 minutes from now, rounded to the next 5 minutes.
    const d = new Date(Date.now() + 30 * 60_000);
    d.setSeconds(0, 0);
    d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5);
    // datetime-local needs YYYY-MM-DDTHH:MM in the user's tz, no offset.
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [picked, setPicked] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(
    () =>
      opponentUsername.trim().length > 0 &&
      picked.length >= MIN_ROUNDS &&
      picked.length <= MAX_ROUNDS &&
      startsAtLocal.length > 0 &&
      !busy,
    [opponentUsername, picked.length, startsAtLocal, busy],
  );

  function togglePick(songId: string) {
    setPicked((prev) => {
      if (prev.includes(songId)) return prev.filter((id) => id !== songId);
      if (prev.length >= MAX_ROUNDS) return prev;
      return [...prev, songId];
    });
  }

  function reorder(songId: string, direction: -1 | 1) {
    setPicked((prev) => {
      const i = prev.indexOf(songId);
      if (i < 0) return prev;
      const j = i + direction;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/verzuz/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opponentUsername: opponentUsername.trim().replace(/^@/, ""),
          challengerSongIds: picked,
          theme: theme.trim() || undefined,
          totalRounds: picked.length,
          roundDurationSec: tier === "SPEED" ? 90 : roundDuration,
          tier,
          startsAt: new Date(startsAtLocal).toISOString(),
          message: message.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        challenge?: { id: string };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to send challenge.");
      const challengeId = data.challenge?.id;
      if (challengeId) {
        router.push(`/verzuz/challenge/${challengeId}`);
      } else {
        router.push("/versus/inbox");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-3xl border border-white/12 bg-[#0a0a0e]/70 p-6 backdrop-blur-xl shadow-[0_30px_60px_-30px_rgba(0,0,0,0.7)]"
    >
      {/* Opponent */}
      <section>
        <label
          htmlFor="opponent"
          className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-white/50"
        >
          Opponent
        </label>
        <div className="flex items-stretch gap-2">
          <span className="flex items-center rounded-l-xl border border-r-0 border-white/15 bg-white/5 px-3 text-sm text-white/45">
            @
          </span>
          <input
            id="opponent"
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            required
            value={opponentUsername}
            onChange={(e) => setOpponentUsername(e.target.value)}
            placeholder="their studio username"
            className="flex-1 rounded-r-xl border border-white/15 bg-white/4 px-3 py-2.5 text-sm text-white placeholder-white/30 focus:border-rose-400/60 focus:outline-none focus:ring-1 focus:ring-rose-400/40"
          />
        </div>
        <p className="mt-1.5 text-[11px] text-white/40">
          They&apos;ll get a push notification + inbox card with 48 hours
          to accept.
        </p>
      </section>

      {/* Theme + tier */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="theme"
            className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-white/50"
          >
            Theme (optional)
          </label>
          <input
            id="theme"
            type="text"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            maxLength={80}
            placeholder="Hip-hop legends · Trap kings · Reggaeton"
            className="w-full rounded-xl border border-white/15 bg-white/4 px-3 py-2.5 text-sm text-white placeholder-white/30 focus:border-rose-400/60 focus:outline-none focus:ring-1 focus:ring-rose-400/40"
          />
        </div>
        <div>
          <span className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-white/50">
            Tier
          </span>
          <div className="grid grid-cols-2 gap-2">
            {TIER_OPTIONS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTier(t.value)}
                className={`rounded-xl border p-3 text-left transition ${
                  tier === t.value
                    ? "border-rose-400/60 bg-rose-500/12 text-white shadow-[0_0_18px_-6px_rgba(255,72,128,0.4)]"
                    : "border-white/12 bg-white/3 text-white/70 hover:bg-white/8"
                }`}
              >
                <p className="text-sm font-bold">{t.label}</p>
                <p className="mt-0.5 text-[11px] text-white/50">{t.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Start time */}
      <section>
        <label
          htmlFor="startsAt"
          className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-white/50"
        >
          Starts at
        </label>
        <input
          id="startsAt"
          type="datetime-local"
          required
          value={startsAtLocal}
          onChange={(e) => setStartsAtLocal(e.target.value)}
          className="w-full rounded-xl border border-white/15 bg-white/4 px-3 py-2.5 text-sm text-white focus:border-rose-400/60 focus:outline-none focus:ring-1 focus:ring-rose-400/40"
        />
        <p className="mt-1.5 text-[11px] text-white/40">
          The opponent has 48 hours to accept; if they wait past the start
          time, the match kicks off the moment they accept.
        </p>
      </section>

      {/* Setlist picker */}
      <section>
        <div className="mb-2 flex items-end justify-between">
          <label className="block text-[11px] font-bold uppercase tracking-widest text-white/50">
            Your setlist · {picked.length}/{MAX_ROUNDS}
          </label>
          <span className="text-[11px] text-white/40">
            Tap to add. Numbers show round order.
          </span>
        </div>
        <div className="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto rounded-2xl border border-white/8 bg-black/30 p-2 sm:grid-cols-2">
          {mySongs.map((song) => {
            const orderIdx = picked.indexOf(song.id);
            const isPicked = orderIdx >= 0;
            return (
              <button
                key={song.id}
                type="button"
                onClick={() => togglePick(song.id)}
                disabled={!isPicked && picked.length >= MAX_ROUNDS}
                className={`group relative flex items-center gap-3 rounded-xl border p-2.5 text-left transition ${
                  isPicked
                    ? "border-rose-400/60 bg-rose-500/10"
                    : "border-white/10 bg-white/3 hover:border-white/25 hover:bg-white/8 disabled:opacity-40"
                }`}
              >
                <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-brand-900/40">
                  {song.coverUrl ? (
                    <Image
                      src={song.coverUrl}
                      alt=""
                      fill
                      sizes="48px"
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-base">
                      🎵
                    </span>
                  )}
                  {isPicked && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/60 text-base font-black text-rose-200">
                      {orderIdx + 1}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white">{song.title}</p>
                  <p className="text-[10px] text-white/40">
                    {song.genre ?? "—"}
                    {song.bpm ? ` · ${song.bpm} BPM` : ""}
                  </p>
                </div>
                {isPicked && (
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        reorder(song.id, -1);
                      }}
                      disabled={orderIdx === 0}
                      aria-label="Move earlier"
                      className="flex h-5 w-5 items-center justify-center rounded text-xs text-white/60 hover:bg-white/10 disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        reorder(song.id, 1);
                      }}
                      disabled={orderIdx === picked.length - 1}
                      aria-label="Move later"
                      className="flex h-5 w-5 items-center justify-center rounded text-xs text-white/60 hover:bg-white/10 disabled:opacity-30"
                    >
                      ▼
                    </button>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Message */}
      <section>
        <label
          htmlFor="message"
          className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-white/50"
        >
          Message (optional)
        </label>
        <textarea
          id="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Trash talk welcome. They'll see this on the invite card."
          className="w-full resize-none rounded-xl border border-white/15 bg-white/4 px-3 py-2.5 text-sm text-white placeholder-white/30 focus:border-rose-400/60 focus:outline-none focus:ring-1 focus:ring-rose-400/40"
        />
      </section>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] text-white/45">
          {picked.length === 0
            ? "Pick at least one song to lock in your setlist."
            : `Sending a ${picked.length}-round Verzuz invite${theme ? ` · ${theme}` : ""}.`}
        </p>
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-xl bg-rose-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-rose-500/35 transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Sending…" : "Send Verzuz challenge →"}
        </button>
      </div>
    </form>
  );
}
