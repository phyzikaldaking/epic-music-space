"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserSupabaseClient, CHANNELS } from "@/lib/supabase";
import { getStreamUrl } from "@/lib/audioStream";

interface ArtistSummary {
  id: string;
  name: string;
  image: string | null;
  isVerified: boolean;
  studioUsername: string | null;
}
interface SongSummary {
  id: string;
  title: string;
  artist: string;
  coverUrl: string | null;
  genre: string | null;
  bpm: number | null;
}
interface Round {
  roundNumber: number;
  songA: SongSummary;
  songB: SongSummary;
  votesA: number;
  votesB: number;
  winner: "A" | "B" | "TIE" | null;
}
interface Props {
  matchId: string;
  artistA: ArtistSummary;
  artistB: ArtistSummary;
  theme: string | null;
  status: "SCHEDULED" | "LIVE" | "COMPLETED";
  currentRound: number;
  totalRounds: number;
  roundDurationSec: number;
  startsAt: string;
  endsAt: string | null;
  rounds: Round[];
  myVotes: Record<number, string>;
  initialScore: { aWins: number; bWins: number; ties: number };
  isViewerArtist: boolean;
  isAuthed: boolean;
}

function fmt(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

export default function VerzuzStage(props: Props) {
  const [rounds, setRounds] = useState<Round[]>(props.rounds);
  const [myVotes, setMyVotes] = useState<Record<number, string>>(props.myVotes);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const audioARef = useRef<HTMLAudioElement | null>(null);
  const audioBRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  // 1Hz tick for the round timer + auto-pull on flip.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Realtime vote updates from any other viewer.
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;
    const ch = supabase
      .channel(CHANNELS.versus(props.matchId))
      .on("broadcast", { event: "verzuz_vote" }, ({ payload }) => {
        const p = payload as { roundNumber: number; votesA: number; votesB: number };
        setRounds((prev) =>
          prev.map((r) =>
            r.roundNumber === p.roundNumber
              ? { ...r, votesA: p.votesA, votesB: p.votesB }
              : r,
          ),
        );
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [props.matchId]);

  // Cleanup audio on unmount.
  useEffect(() => {
    return () => {
      for (const ref of [audioARef, audioBRef]) {
        if (ref.current) {
          ref.current.pause();
          ref.current.src = "";
          ref.current = null;
        }
      }
    };
  }, []);

  const startMs = useMemo(() => new Date(props.startsAt).getTime(), [props.startsAt]);
  const elapsedSec = Math.floor((now - startMs) / 1000);
  const computedRound = Math.min(
    props.totalRounds,
    Math.max(1, Math.floor(elapsedSec / props.roundDurationSec) + 1),
  );
  const liveRoundNumber = props.status === "LIVE" ? computedRound : props.currentRound;
  const secondsIntoRound = Math.max(0, elapsedSec - (liveRoundNumber - 1) * props.roundDurationSec);
  const secondsLeft = Math.max(0, props.roundDurationSec - secondsIntoRound);
  const tickPct = (secondsIntoRound / props.roundDurationSec) * 100;
  const matchStarted = now >= startMs;
  const liveRound = rounds.find((r) => r.roundNumber === liveRoundNumber) ?? null;

  // Recompute score from the rounds we know about — keeps pace with realtime.
  const score = rounds.reduce(
    (acc, r) => {
      if (r.winner === "A") acc.aWins++;
      else if (r.winner === "B") acc.bWins++;
      else if (r.winner === "TIE") acc.ties++;
      return acc;
    },
    { aWins: 0, bWins: 0, ties: 0 },
  );

  function togglePreview(side: "A" | "B", song: SongSummary) {
    const ref = side === "A" ? audioARef : audioBRef;
    const otherRef = side === "A" ? audioBRef : audioARef;
    if (otherRef.current) otherRef.current.pause();
    if (!ref.current) {
      const audio = new Audio(getStreamUrl(song.id));
      audio.volume = 0.85;
      audio.preload = "metadata";
      try {
        audio.setAttribute("controlsList", "nodownload nofullscreen noremoteplayback");
        audio.setAttribute("disablePictureInPicture", "true");
        audio.crossOrigin = "anonymous";
      } catch {
        /* older browsers */
      }
      audio.addEventListener("ended", () => setPlayingId(null));
      audio.addEventListener("error", () => setPlayingId(null));
      ref.current = audio;
    }
    if (playingId === song.id) {
      ref.current.pause();
      setPlayingId(null);
    } else {
      void ref.current.play().catch(() => setPlayingId(null));
      setPlayingId(song.id);
    }
  }

  async function vote(songId: string) {
    if (busy || !liveRound || props.isViewerArtist || !props.isAuthed) return;
    if (props.status !== "LIVE") return;
    setBusy(true);
    try {
      const res = await fetch(`/api/verzuz/${props.matchId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundNumber: liveRound.roundNumber, votedSongId: songId }),
      });
      if (res.ok) {
        const data = (await res.json()) as { roundNumber: number; votesA: number; votesB: number };
        setRounds((prev) =>
          prev.map((r) =>
            r.roundNumber === data.roundNumber
              ? { ...r, votesA: data.votesA, votesB: data.votesB }
              : r,
          ),
        );
        setMyVotes((prev) => ({ ...prev, [data.roundNumber]: songId }));
      }
    } finally {
      setBusy(false);
    }
  }

  const totalLiveVotes = liveRound ? liveRound.votesA + liveRound.votesB : 0;
  const pctA = liveRound && totalLiveVotes > 0
    ? Math.round((liveRound.votesA / totalLiveVotes) * 100)
    : 50;
  const pctB = 100 - pctA;
  const myPick = liveRound ? myVotes[liveRound.roundNumber] : undefined;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#06060a]">
      {/* Stage backdrop — gradient + animated lights */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(124,58,237,0.4),transparent_50%),radial-gradient(circle_at_80%_70%,rgba(0,245,255,0.35),transparent_55%),linear-gradient(180deg,#06060a_0%,#0c0a18_60%,#06060a_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[60vh] bg-[repeating-linear-gradient(115deg,rgba(255,255,255,0.04)_0_2px,transparent_2px_30px)] mix-blend-screen"
      />
      <div className="relative mx-auto max-w-6xl px-4 py-10">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[10px] font-black uppercase tracking-[0.32em] text-white/55 backdrop-blur">
            {props.status === "LIVE" ? "🔴 Live Verzuz" : props.status === "SCHEDULED" ? "Verzuz · Scheduled" : "Verzuz · Ended"}
          </span>
          <h1 className="mt-4 text-4xl font-black tracking-tight md:text-6xl">
            <span className="text-gradient-ems">{props.artistA.name}</span>
            <span className="mx-3 text-white/35">vs</span>
            <span className="text-gradient-ems">{props.artistB.name}</span>
          </h1>
          {props.theme && (
            <p className="mt-2 text-sm font-semibold uppercase tracking-widest text-white/55">
              {props.theme}
            </p>
          )}
          <p className="mt-3 text-xs text-white/45">
            {props.totalRounds} rounds · {Math.round(props.roundDurationSec / 60)} min each
          </p>
        </div>

        {/* Scoreboard + round timer */}
        <div className="mb-6 grid grid-cols-3 items-stretch gap-3 rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur">
          <ScorePill side="A" label={props.artistA.name} wins={score.aWins} />
          <div className="flex flex-col items-center justify-center gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/45">
              Round {liveRound ? liveRound.roundNumber : props.currentRound} / {props.totalRounds}
            </span>
            {props.status === "LIVE" && (
              <>
                <span className="font-mono text-2xl font-black text-white">{fmt(secondsLeft)}</span>
                <div className="mt-1 h-1.5 w-32 overflow-hidden rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-400 transition-[width] duration-1000"
                    style={{ width: `${tickPct}%` }}
                  />
                </div>
              </>
            )}
            {props.status === "SCHEDULED" && (
              <span className="text-xs text-white/55">
                Starts {new Date(props.startsAt).toLocaleString()}
              </span>
            )}
            {props.status === "COMPLETED" && score.aWins !== score.bWins && (
              <span className="rounded-full bg-gold-500/20 px-3 py-1 text-xs font-black text-gold-200">
                {score.aWins > score.bWins ? props.artistA.name : props.artistB.name} took it
              </span>
            )}
            {props.status === "COMPLETED" && score.aWins === score.bWins && (
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-white/75">
                Tied {score.aWins}–{score.bWins}
              </span>
            )}
          </div>
          <ScorePill side="B" label={props.artistB.name} wins={score.bWins} />
        </div>

        {!props.isAuthed && (
          <p className="mb-6 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-xs text-white/65">
            <Link href="/auth/signin" className="font-bold text-brand-400 hover:underline">
              Sign in
            </Link>{" "}
            to vote on the live round.
          </p>
        )}
        {props.isViewerArtist && (
          <p className="mb-6 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-xs text-white/65">
            Artists in the match can&apos;t vote — sit back, the audience decides.
          </p>
        )}

        {/* The stage */}
        {liveRound ? (
          <div className="mb-10 grid gap-4 md:grid-cols-2">
            <SongSide
              side="A"
              song={liveRound.songA}
              artist={props.artistA}
              votes={liveRound.votesA}
              pct={pctA}
              picked={myPick === liveRound.songA.id}
              isPreviewing={playingId === liveRound.songA.id}
              onPreview={() => togglePreview("A", liveRound.songA)}
              onVote={() => vote(liveRound.songA.id)}
              disabled={busy || props.isViewerArtist || !props.isAuthed || props.status !== "LIVE"}
            />
            <SongSide
              side="B"
              song={liveRound.songB}
              artist={props.artistB}
              votes={liveRound.votesB}
              pct={pctB}
              picked={myPick === liveRound.songB.id}
              isPreviewing={playingId === liveRound.songB.id}
              onPreview={() => togglePreview("B", liveRound.songB)}
              onVote={() => vote(liveRound.songB.id)}
              disabled={busy || props.isViewerArtist || !props.isAuthed || props.status !== "LIVE"}
            />
          </div>
        ) : (
          <div className="mb-10 rounded-2xl border border-white/10 bg-white/4 p-8 text-center text-white/55">
            {matchStarted ? "Round loading…" : "Verzuz hasn't started yet."}
          </div>
        )}

        {/* Round ladder */}
        <div className="rounded-2xl border border-white/8 bg-black/30 p-4 backdrop-blur">
          <p className="mb-3 text-[10px] font-black uppercase tracking-[0.24em] text-white/45">
            Round ladder
          </p>
          <ol className="grid gap-2 sm:grid-cols-2">
            {rounds.map((r) => {
              const isLive = props.status === "LIVE" && r.roundNumber === liveRoundNumber;
              const winnerLabel =
                r.winner === "A" ? props.artistA.name
                : r.winner === "B" ? props.artistB.name
                : r.winner === "TIE" ? "Tie"
                : null;
              return (
                <li
                  key={r.roundNumber}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-xs ${
                    isLive
                      ? "border-brand-500/45 bg-brand-500/10"
                      : r.winner
                        ? "border-white/10 bg-white/4"
                        : "border-white/8 bg-white/2 text-white/45"
                  }`}
                >
                  <span className="w-8 text-center font-black tabular-nums text-white/55">
                    {r.roundNumber}
                  </span>
                  <span className="flex-1 truncate">
                    <span className="text-white/75">{r.songA.title}</span>
                    <span className="text-white/35"> vs </span>
                    <span className="text-white/75">{r.songB.title}</span>
                  </span>
                  {winnerLabel && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${
                        r.winner === "TIE"
                          ? "bg-white/10 text-white/65"
                          : "bg-gold-500/20 text-gold-200"
                      }`}
                    >
                      {winnerLabel}
                    </span>
                  )}
                  {isLive && (
                    <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-black text-red-200">
                      LIVE
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}

function ScorePill({ side, label, wins }: { side: "A" | "B"; label: string; wins: number }) {
  const sideColor = side === "A" ? "from-brand-500 to-accent-400" : "from-accent-500 to-brand-400";
  return (
    <div
      className={`flex items-center justify-center gap-3 rounded-xl border border-white/10 bg-gradient-to-br ${sideColor} bg-opacity-20 p-3`}
    >
      <span className="text-[10px] font-black uppercase tracking-widest text-white/65">
        {side === "A" ? "Side A" : "Side B"}
      </span>
      <span className="truncate text-sm font-black">{label}</span>
      <span className="ml-auto rounded-full bg-black/45 px-2.5 py-0.5 text-sm font-black tabular-nums">
        {wins}
      </span>
    </div>
  );
}

function SongSide({
  side,
  song,
  artist,
  votes,
  pct,
  picked,
  isPreviewing,
  onPreview,
  onVote,
  disabled,
}: {
  side: "A" | "B";
  song: SongSummary;
  artist: ArtistSummary;
  votes: number;
  pct: number;
  picked: boolean;
  isPreviewing: boolean;
  onPreview: () => void;
  onVote: () => void;
  disabled: boolean;
}) {
  const accent = side === "A" ? "brand" : "accent";
  return (
    <div
      className={`relative overflow-hidden rounded-3xl border bg-gradient-to-b from-white/8 via-white/4 to-transparent p-5 shadow-2xl shadow-black/50 transition ${
        picked ? `border-${accent}-400/55` : "border-white/12"
      }`}
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-500 via-accent-400 to-gold-300 opacity-60" />
      <div className="flex items-start gap-4">
        <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-900 to-accent-700 shadow-lg shadow-black/40">
          {song.coverUrl ? (
            <Image src={song.coverUrl} alt="" fill unoptimized className="object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl">🎵</div>
          )}
          <span className="absolute left-1.5 top-1.5 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-black tracking-widest backdrop-blur">
            {side}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/45">
            {artist.name}
            {artist.isVerified && <span className="ml-1 text-cyan-300">✓</span>}
          </p>
          <h2 className="mt-0.5 truncate text-lg font-black leading-tight">{song.title}</h2>
          <p className="mt-1 truncate text-xs text-white/50">
            {song.genre ?? "Genre"}
            {song.bpm ? ` · ${song.bpm} BPM` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onPreview}
              aria-label={isPreviewing ? `Pause ${song.title}` : `Preview ${song.title}`}
              className="rounded-lg border border-white/15 bg-white/4 px-3 py-1 text-[11px] font-bold hover:bg-white/8"
            >
              {isPreviewing ? "⏸ Pause" : "▶ Preview"}
            </button>
            <Link
              href={`/track/${song.id}`}
              className="rounded-lg border border-white/15 bg-white/4 px-3 py-1 text-[11px] font-bold text-white/65 hover:bg-white/8 hover:text-white"
            >
              Open track
            </Link>
          </div>
        </div>
      </div>

      {/* Vote bar */}
      <div className="mt-5">
        <div className="mb-1 flex items-baseline justify-between text-[10px] font-bold uppercase tracking-widest text-white/55">
          <span>{votes} {votes === 1 ? "vote" : "votes"}</span>
          <span className="font-black text-white">{pct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/8">
          <div
            className={`h-full rounded-full bg-gradient-to-r from-${accent}-500 to-${accent === "brand" ? "accent" : "brand"}-400 transition-all duration-500`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onVote}
        disabled={disabled}
        className={`mt-4 w-full rounded-2xl py-3 text-sm font-black uppercase tracking-widest text-white shadow-lg transition disabled:opacity-50 ${
          picked
            ? `bg-${accent}-500 shadow-${accent}-500/35`
            : `border border-${accent}-500/40 bg-${accent}-500/10 hover:bg-${accent}-500/20`
        }`}
      >
        {picked ? "Your pick" : `Vote ${side}`}
      </button>
    </div>
  );
}
