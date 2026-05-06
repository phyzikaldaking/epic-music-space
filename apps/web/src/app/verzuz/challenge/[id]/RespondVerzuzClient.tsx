"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Person {
  name: string | null;
  image: string | null;
  username: string | null;
}

interface SongLite {
  id: string;
  title: string;
  artist?: string;
  coverUrl: string | null;
  genre?: string | null;
  bpm?: number | null;
}

interface ChallengeView {
  id: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "CANCELLED";
  theme: string | null;
  totalRounds: number;
  roundDurationSec: number;
  tier: string;
  startsAt: string;
  expiresAt: string;
  message: string | null;
  matchId: string | null;
}

interface Props {
  role: "CHALLENGER" | "OPPONENT";
  challenge: ChallengeView;
  challenger: Person | null;
  opponent: Person | null;
  challengerSetlist: SongLite[];
  mySongs: SongLite[];
}

export default function RespondVerzuzClient({
  role,
  challenge,
  challenger,
  opponent,
  challengerSetlist,
  mySongs,
}: Props) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPending = challenge.status === "PENDING";
  const requiredSetlistSize = challenge.totalRounds;

  const canAccept = useMemo(
    () => isPending && role === "OPPONENT" && picked.length === requiredSetlistSize && !busy,
    [isPending, role, picked.length, requiredSetlistSize, busy],
  );

  function togglePick(songId: string) {
    setPicked((prev) => {
      if (prev.includes(songId)) return prev.filter((id) => id !== songId);
      if (prev.length >= requiredSetlistSize) return prev;
      return [...prev, songId];
    });
  }

  function reorder(songId: string, dir: -1 | 1) {
    setPicked((prev) => {
      const i = prev.indexOf(songId);
      if (i < 0) return prev;
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function send(action: "accept" | "decline" | "cancel") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/verzuz/challenges/${challenge.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "accept"
            ? { action, opponentSongIds: picked }
            : { action },
        ),
      });
      const data = (await res.json().catch(() => ({}))) as {
        matchId?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Action failed.");
      if (action === "accept" && data.matchId) {
        router.push(`/verzuz/${data.matchId}`);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const startsAt = new Date(challenge.startsAt);
  const expiresAt = new Date(challenge.expiresAt);

  return (
    <div className="space-y-6">
      <StatusBanner status={challenge.status} matchId={challenge.matchId} />

      {/* Header — challenger vs opponent at the top */}
      <div className="rounded-3xl border border-white/12 bg-[#0a0a0e]/70 p-6 backdrop-blur-xl shadow-[0_30px_60px_-30px_rgba(0,0,0,0.7)]">
        <p className="text-[11px] font-black uppercase tracking-[0.28em] text-rose-300">
          {role === "OPPONENT" ? "You've been challenged" : "Your Verzuz invite"}
        </p>
        <div className="mt-3 flex items-center gap-4">
          <PersonChip person={challenger} fallbackInitial="A" />
          <span className="text-2xl font-black text-white/30">VS</span>
          <PersonChip person={opponent} fallbackInitial="B" />
        </div>

        {challenge.theme && (
          <p className="mt-4 text-sm font-bold uppercase tracking-widest text-rose-200/80">
            🎤 Theme: {challenge.theme}
          </p>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <Stat label="Rounds" value={`${challenge.totalRounds}`} />
          <Stat label="Per round" value={`${Math.round(challenge.roundDurationSec / 60)}m`} />
          <Stat label="Tier" value={challenge.tier === "SPEED" ? "Speed" : "Main event"} />
          <Stat label="Starts" value={startsAt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} />
        </dl>

        {challenge.message && (
          <blockquote className="mt-4 rounded-xl border border-white/10 bg-white/4 p-3 text-sm italic text-white/75">
            &ldquo;{challenge.message}&rdquo;
          </blockquote>
        )}

        {isPending && (
          <p className="mt-4 text-[11px] text-white/45">
            Expires {expiresAt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </p>
        )}
      </div>

      {/* Challenger's setlist */}
      <section className="rounded-3xl border border-white/12 bg-[#0a0a0e]/60 p-5 backdrop-blur-xl">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-white/55">
          {challenger?.name ?? "Challenger"}&apos;s setlist · {challengerSetlist.length} {challengerSetlist.length === 1 ? "track" : "tracks"}
        </p>
        <ol className="grid gap-2 sm:grid-cols-2">
          {challengerSetlist.map((song, i) => (
            <li
              key={song.id}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/3 p-2.5"
            >
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-rose-500/20 text-[11px] font-black text-rose-200">
                {i + 1}
              </span>
              <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-md bg-brand-900/40">
                {song.coverUrl ? (
                  <Image src={song.coverUrl} alt="" fill sizes="40px" className="object-cover" unoptimized />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-sm">🎵</span>
                )}
              </div>
              <p className="min-w-0 flex-1 truncate text-sm font-bold text-white">{song.title}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Opponent's response panel */}
      {role === "OPPONENT" && isPending && (
        <section className="rounded-3xl border border-rose-400/35 bg-rose-500/8 p-5 backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-black uppercase tracking-widest text-rose-200">
              Pick your setlist · {picked.length}/{requiredSetlistSize}
            </p>
            <span className="text-[11px] text-white/40">Tap to add. ▲▼ to reorder.</span>
          </div>

          {mySongs.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-center text-sm text-white/65">
              You don&apos;t have any active tracks to set against this match.
              <Link
                href="/studio/new"
                className="mt-2 inline-block rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15"
              >
                Upload a track →
              </Link>
            </div>
          ) : (
            <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto rounded-2xl border border-white/8 bg-black/30 p-2 sm:grid-cols-2">
              {mySongs.map((song) => {
                const orderIdx = picked.indexOf(song.id);
                const isPicked = orderIdx >= 0;
                return (
                  <button
                    key={song.id}
                    type="button"
                    onClick={() => togglePick(song.id)}
                    disabled={!isPicked && picked.length >= requiredSetlistSize}
                    className={`group relative flex items-center gap-3 rounded-xl border p-2.5 text-left transition ${
                      isPicked
                        ? "border-rose-400/60 bg-rose-500/15"
                        : "border-white/10 bg-white/3 hover:border-white/25 hover:bg-white/8 disabled:opacity-40"
                    }`}
                  >
                    <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-brand-900/40">
                      {song.coverUrl ? (
                        <Image src={song.coverUrl} alt="" fill sizes="48px" className="object-cover" unoptimized />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-base">🎵</span>
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
          )}

          {error && (
            <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => void send("decline")}
              disabled={busy}
              className="rounded-xl border border-white/15 bg-white/4 px-4 py-2 text-sm font-semibold text-white/75 transition hover:bg-white/8 disabled:opacity-40"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={() => void send("accept")}
              disabled={!canAccept}
              className="rounded-xl bg-rose-500 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-rose-500/35 transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Locking in…" : `Accept · stage ${requiredSetlistSize}-round Verzuz`}
            </button>
          </div>
        </section>
      )}

      {/* Challenger panel — view-only + cancel */}
      {role === "CHALLENGER" && isPending && (
        <section className="rounded-3xl border border-white/10 bg-white/3 p-5 backdrop-blur-md">
          <p className="text-sm text-white/65">
            Waiting on {opponent?.name ?? "the opponent"} to pick their
            setlist. They&apos;ll get a push if they have notifications on,
            and the invite shows up in their inbox.
          </p>
          {error && (
            <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}
          <button
            type="button"
            onClick={() => void send("cancel")}
            disabled={busy}
            className="mt-4 rounded-xl border border-white/15 bg-white/4 px-4 py-2 text-sm font-semibold text-white/70 transition hover:bg-red-500/20 hover:text-red-200 disabled:opacity-40"
          >
            {busy ? "Cancelling…" : "Cancel this invite"}
          </button>
        </section>
      )}
    </div>
  );
}

function StatusBanner({
  status,
  matchId,
}: {
  status: ChallengeView["status"];
  matchId: string | null;
}) {
  if (status === "PENDING") return null;
  const tone =
    status === "ACCEPTED"
      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
      : status === "EXPIRED"
        ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
        : "border-white/15 bg-white/5 text-white/70";

  const headline =
    status === "ACCEPTED"
      ? "🎤 Match staged — see you in the ring."
      : status === "DECLINED"
        ? "Opponent passed on this one."
        : status === "CANCELLED"
          ? "Invite cancelled."
          : "Invite expired before the opponent responded.";

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 backdrop-blur-md ${tone}`}
    >
      <p className="text-sm font-bold">{headline}</p>
      {status === "ACCEPTED" && matchId && (
        <Link
          href={`/verzuz/${matchId}`}
          className="rounded-xl bg-emerald-400 px-3 py-1.5 text-xs font-bold text-emerald-950 hover:bg-emerald-300"
        >
          View match →
        </Link>
      )}
    </div>
  );
}

function PersonChip({
  person,
  fallbackInitial,
}: {
  person: Person | null;
  fallbackInitial: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-brand-500 to-accent-500">
        {person?.image ? (
          <Image src={person.image} alt="" fill sizes="48px" className="object-cover" unoptimized />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-base font-black">
            {fallbackInitial}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-white">{person?.name ?? "Artist"}</p>
        {person?.username && (
          <Link
            href={`/studio/${person.username}`}
            className="truncate text-[11px] text-white/55 hover:text-white/85 hover:underline"
          >
            @{person.username}
          </Link>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/3 px-2.5 py-1.5">
      <p className="text-[9px] font-bold uppercase tracking-widest text-white/40">{label}</p>
      <p className="mt-0.5 text-xs font-bold text-white">{value}</p>
    </div>
  );
}
