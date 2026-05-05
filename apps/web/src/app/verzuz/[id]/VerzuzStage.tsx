"use client";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserSupabaseClient, CHANNELS } from "@/lib/supabase";
import { getStreamUrl } from "@/lib/audioStream";

const StageBackdrop3D = dynamic(() => import("@/components/verzuz/StageBackdrop3D"), {
  ssr: false,
});

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

type ReactionBurst = {
  id: number;
  emoji: string;
  xPct: number;
  phase: "enter" | "exit";
};

function fmt(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

function fmtCalUtc(d: Date) {
  // Google Calendar "dates" param expects UTC: YYYYMMDDTHHMMSSZ
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export default function VerzuzStage(props: Props) {
  const [rounds, setRounds] = useState<Round[]>(props.rounds);
  const [myVotes, setMyVotes] = useState<Record<number, string>>(props.myVotes);
  const [serverRound, setServerRound] = useState(props.currentRound);
  const [serverStatus, setServerStatus] = useState<Props["status"]>(props.status);
  const [serverEndsAt, setServerEndsAt] = useState<string | null>(props.endsAt);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [realtimeState, setRealtimeState] = useState<string>("INIT");
  const [shareUrl, setShareUrl] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const audioARef = useRef<HTMLAudioElement | null>(null);
  const audioBRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [bursts, setBursts] = useState<ReactionBurst[]>([]);
  const burstSeq = useRef(1);
  const burstTimeouts = useRef<number[]>([]);

  useEffect(() => {
    // Avoid reading window during SSR. (This is a client component, but it can
    // still render on the server during initial pass.)
    try {
      setShareUrl(window.location.href);
    } catch {
      setShareUrl("");
    }
  }, []);

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
      .on("broadcast", { event: "verzuz_reaction" }, ({ payload }) => {
        const p = payload as { emoji?: string };
        if (p.emoji) spawnBurst(p.emoji);
      })
      .on("broadcast", { event: "verzuz_state" }, ({ payload }) => {
        const p = payload as {
          currentRound?: number;
          status?: Props["status"];
          endsAt?: string | null;
          closedRounds?: { roundNumber: number; winner: "A" | "B" | "TIE" }[];
        };
        if (typeof p.currentRound === "number") setServerRound(p.currentRound);
        if (p.status) setServerStatus(p.status);
        if (p.endsAt !== undefined) setServerEndsAt(p.endsAt);
        if (p.closedRounds && p.closedRounds.length > 0) {
          setRounds((prev) =>
            prev.map((r) => {
              const closed = p.closedRounds?.find((c) => c.roundNumber === r.roundNumber);
              return closed ? { ...r, winner: closed.winner } : r;
            }),
          );
        }
      })
      .subscribe((status) => {
        setRealtimeState(status);
      });
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [props.matchId]);

  // Poll as a safety net so the stage stays correct even when realtime is
  // down, misconfigured, or the viewer's connection drops.
  useEffect(() => {
    if (serverStatus === "COMPLETED") return;
    let cancelled = false;

    async function pollOnce() {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/verzuz/${props.matchId}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          match: {
            status: Props["status"];
            currentRound: number;
            endsAt: string | null;
            rounds: {
              roundNumber: number;
              votesA: number;
              votesB: number;
              winner: "A" | "B" | "TIE" | null;
            }[];
          };
          myVotes: { roundNumber: number; votedSongId: string }[];
        };
        setServerStatus(data.match.status);
        setServerRound(data.match.currentRound);
        setServerEndsAt(data.match.endsAt);
        setRounds((prev) =>
          prev.map((r) => {
            const latest = data.match.rounds.find((x) => x.roundNumber === r.roundNumber);
            return latest ? { ...r, votesA: latest.votesA, votesB: latest.votesB, winner: latest.winner } : r;
          }),
        );
        setMyVotes(Object.fromEntries(data.myVotes.map((v) => [v.roundNumber, v.votedSongId])));
      } catch {
        /* ignore */
      }
    }

    void pollOnce();
    const ms = realtimeState === "SUBSCRIBED" ? 30_000 : 6_000;
    const interval = setInterval(pollOnce, ms);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [props.matchId, realtimeState, serverStatus]);

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
      for (const t of burstTimeouts.current) clearTimeout(t);
      burstTimeouts.current = [];
    };
  }, []);

  const startMs = useMemo(() => new Date(props.startsAt).getTime(), [props.startsAt]);
  const elapsedSec = Math.floor((now - startMs) / 1000);
  const computedRound = Math.min(
    props.totalRounds,
    Math.max(1, Math.floor(elapsedSec / props.roundDurationSec) + 1),
  );
  const liveRoundNumber =
    serverStatus === "LIVE"
      ? Math.min(props.totalRounds, Math.max(1, serverRound || computedRound))
      : serverRound;
  const secondsIntoRound = Math.max(0, elapsedSec - (liveRoundNumber - 1) * props.roundDurationSec);
  const secondsLeft = Math.max(0, props.roundDurationSec - secondsIntoRound);
  const tickPct = (secondsIntoRound / props.roundDurationSec) * 100;
  const matchStarted = now >= startMs;
  const liveRound = rounds.find((r) => r.roundNumber === liveRoundNumber) ?? null;

  const calendarUrl = useMemo(() => {
    const start = new Date(props.startsAt);
    const end = new Date(start.getTime() + props.totalRounds * props.roundDurationSec * 1000);
    const text = `Verzuz: ${props.artistA.name} vs ${props.artistB.name}`;
    const details = [
      props.theme ? `Theme: ${props.theme}` : null,
      shareUrl ? `Watch: ${shareUrl}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text,
      dates: `${fmtCalUtc(start)}/${fmtCalUtc(end)}`,
      details,
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }, [props.startsAt, props.totalRounds, props.roundDurationSec, props.artistA.name, props.artistB.name, props.theme, shareUrl]);

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

  function spawnBurst(emoji: string) {
    const id = burstSeq.current++;
    const xPct = 12 + Math.random() * 76;
    const burst: ReactionBurst = { id, emoji, xPct, phase: "enter" };
    setBursts((prev) => [...prev, burst].slice(-30));
    // Kick the transition after paint.
    const t1 = window.setTimeout(() => {
      setBursts((prev) =>
        prev.map((b) => (b.id === id ? { ...b, phase: "exit" as const } : b)),
      );
    }, 20);
    const t2 = window.setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.id !== id));
    }, 1100);
    burstTimeouts.current.push(t1, t2);
  }

  async function sendReaction(emoji: string) {
    if (!props.isAuthed || serverStatus !== "LIVE") return;
    spawnBurst(emoji); // optimistic; feels instant
    try {
      await fetch(`/api/verzuz/${props.matchId}/reaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
    } catch {
      /* ignore */
    }
  }

  async function vote(songId: string) {
    if (busy || !liveRound || props.isViewerArtist || !props.isAuthed) return;
    if (serverStatus !== "LIVE") return;
    setBusy(true);
    setVoteError(null);
    try {
      const res = await fetch(`/api/verzuz/${props.matchId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundNumber: liveRound.roundNumber, votedSongId: songId }),
      });
      const data = (await res.json().catch(() => ({}))) as
        | { roundNumber: number; votesA: number; votesB: number }
        | { error?: string };
      if (!res.ok) {
        setVoteError(("error" in data && data.error) ? data.error : "Vote failed. Try again.");
        return;
      }
      if (!("roundNumber" in data)) return;
      setRounds((prev) =>
        prev.map((r) =>
          r.roundNumber === data.roundNumber
            ? { ...r, votesA: data.votesA, votesB: data.votesB }
            : r,
        ),
      );
      setMyVotes((prev) => ({ ...prev, [data.roundNumber]: songId }));
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
      {/* Mobile-only sticky live-round indicator. Sits below the navbar so
          a fan scrolling through the round ladder always sees what's
          live and how much time is left. Hidden on md+ where the
          scoreboard is in view at the top of the page. */}
      {serverStatus === "LIVE" && liveRound && (
        <div className="sticky top-[57px] z-30 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-white/15 bg-black/80 px-3 py-2 shadow-2xl backdrop-blur md:hidden">
          <span className="flex h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.85)]" aria-hidden />
          <span className="text-[10px] font-black uppercase tracking-widest text-white/55">
            Round {liveRound.roundNumber}/{props.totalRounds}
          </span>
          <span className="ml-auto font-mono text-sm font-bold tabular-nums text-white">
            {fmt(secondsLeft)}
          </span>
        </div>
      )}
      {/* Stage backdrop — gradient + animated lights */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <StageBackdrop3D
          status={serverStatus}
          artistA={props.artistA.name}
          artistB={props.artistB.name}
          theme={props.theme}
        />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(124,58,237,0.4),transparent_50%),radial-gradient(circle_at_80%_70%,rgba(0,245,255,0.35),transparent_55%),linear-gradient(180deg,#06060a_0%,#0c0a18_60%,#06060a_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[60vh] bg-[repeating-linear-gradient(115deg,rgba(255,255,255,0.04)_0_2px,transparent_2px_30px)] mix-blend-screen"
      />
      {/* Live reaction bursts */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-20">
        {bursts.map((b) => (
          <span
            key={b.id}
            className={`absolute bottom-[28%] text-3xl drop-shadow-[0_8px_18px_rgba(0,0,0,0.75)] transition-[transform,opacity] duration-[1100ms] ease-out transform-gpu ${
              b.phase === "enter"
                ? "translate-y-0 scale-100 opacity-100"
                : "-translate-y-24 scale-125 opacity-0"
            }`}
            style={{ left: `${b.xPct}%` }}
          >
            {b.emoji}
          </span>
        ))}
      </div>
      <div className="relative mx-auto max-w-6xl px-4 py-10">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[10px] font-black uppercase tracking-[0.32em] text-white/55 backdrop-blur">
            {serverStatus === "LIVE" ? "🔴 Live Verzuz" : serverStatus === "SCHEDULED" ? "Verzuz · Scheduled" : "Verzuz · Ended"}
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
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (!shareUrl) return;
                void (async () => {
                  try {
                    await navigator.clipboard.writeText(shareUrl);
                  } catch {
                    // Ignore; user can still use the address bar.
                  }
                })();
              }}
              disabled={!shareUrl}
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-white/75 hover:bg-white/10 disabled:opacity-40"
            >
              Copy link
            </button>
            {serverStatus === "SCHEDULED" && (
              <a
                href={calendarUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-gold-400/30 bg-gold-400/10 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-gold-200 hover:bg-gold-400/15"
              >
                Add to calendar
              </a>
            )}
          </div>
        </div>

        {/* Scoreboard + round timer */}
        <div className="mb-6 grid grid-cols-3 items-stretch gap-3 rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur">
          <ScorePill side="A" label={props.artistA.name} wins={score.aWins} />
          <div className="flex flex-col items-center justify-center gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/45">
              Round {liveRound ? liveRound.roundNumber : props.currentRound} / {props.totalRounds}
            </span>
            {serverStatus === "LIVE" && (
              <>
                <span className="font-mono text-2xl font-black text-white">{fmt(secondsLeft)}</span>
                <progress
                  max={100}
                  value={tickPct}
                  className="ems-progress ems-progress-brand mt-1 h-1.5 w-32"
                  aria-label="Round timer"
                />
              </>
            )}
            {serverStatus === "SCHEDULED" && (
              <span className="text-xs text-white/55">
                Starts {new Date(props.startsAt).toLocaleString()}
              </span>
            )}
            {serverStatus === "COMPLETED" && score.aWins !== score.bWins && (
              <span className="rounded-full bg-gold-500/20 px-3 py-1 text-xs font-black text-gold-200">
                {score.aWins > score.bWins ? props.artistA.name : props.artistB.name} took it
              </span>
            )}
            {serverStatus === "COMPLETED" && score.aWins === score.bWins && (
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
        {voteError && (
          <p className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-xs text-red-200">
            {voteError}
          </p>
        )}

        {serverStatus === "LIVE" && props.isAuthed && (
          <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
            {["🔥", "👏", "🐐", "💥", "😤"].map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => void sendReaction(e)}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-2 text-base hover:bg-white/10"
                aria-label={`React ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
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
              disabled={busy || props.isViewerArtist || !props.isAuthed || serverStatus !== "LIVE"}
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
              disabled={busy || props.isViewerArtist || !props.isAuthed || serverStatus !== "LIVE"}
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
              const isLive = serverStatus === "LIVE" && r.roundNumber === liveRoundNumber;
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
  const pickedBorder =
    picked
      ? side === "A"
        ? "border-brand-400/55"
        : "border-accent-400/55"
      : "border-white/12";

  const voteButton =
    side === "A"
      ? picked
        ? "bg-brand-500 shadow-brand-500/35"
        : "border border-brand-500/40 bg-brand-500/10 hover:bg-brand-500/20"
      : picked
        ? "bg-accent-500 shadow-accent-500/35"
        : "border border-accent-500/40 bg-accent-500/10 hover:bg-accent-500/20";
  return (
    <div
      className={`relative overflow-hidden rounded-3xl border bg-gradient-to-b from-white/8 via-white/4 to-transparent p-5 shadow-2xl shadow-black/50 transition ${
        pickedBorder
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
        <progress
          max={100}
          value={pct}
          className={`ems-progress h-2 w-full ${accent === "brand" ? "ems-progress-a" : "ems-progress-b"}`}
          aria-label={`Side ${side} vote share`}
        />
      </div>

      <button
        type="button"
        onClick={onVote}
        disabled={disabled}
        className={`mt-4 w-full rounded-2xl py-3 text-sm font-black uppercase tracking-widest text-white shadow-lg transition disabled:opacity-50 ${voteButton}`}
      >
        {picked ? "Your pick" : `Vote ${side}`}
      </button>
    </div>
  );
}
