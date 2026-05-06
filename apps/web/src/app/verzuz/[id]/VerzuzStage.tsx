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

// ─── types ──────────────────────────────────────────────────────────────────
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
type ReactionBurst = { id: number; emoji: string; xPct: number; phase: "enter" | "exit" };
type RoundReveal = {
  roundNumber: number;
  winner: "A" | "B" | "TIE";
  winnerName: string;
  songTitle: string;
  pctA: number;
  pctB: number;
  totalVotes: number;
};

// ─── helpers ─────────────────────────────────────────────────────────────────
function fmt(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}
function fmtCalUtc(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
function pad2(n: number) {
  return String(Math.floor(n)).padStart(2, "0");
}

// EQ bar heights + durations (fixed so no hydration mismatch)
const EQ_H = [0.45, 0.85, 0.55, 1.0, 0.65, 0.9, 0.50];
const EQ_D = [520, 400, 600, 370, 540, 430, 510]; // ms

// ─── sub-components ──────────────────────────────────────────────────────────
function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="rounded-lg bg-white/8 px-2.5 py-1.5 font-mono text-xl font-black tabular-nums text-white md:text-2xl">
        {pad2(value)}
      </span>
      <span className="mt-0.5 text-[9px] font-black uppercase tracking-[0.2em] text-white/30">{label}</span>
    </div>
  );
}

function HypeBar({ side, pct, name }: { side: "A" | "B"; pct: number; name: string }) {
  const isA = side === "A";
  const filled = Math.round(pct);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className={`text-[9px] font-black uppercase tracking-widest ${isA ? "text-brand-400" : "text-cyan-400"}`}>
          {name}
        </span>
        <span className="text-[9px] font-bold tabular-nums text-white/35">{filled}%</span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/6">
        <div
          className={`absolute left-0 top-0 h-full rounded-full transition-all duration-300 ${
            isA
              ? "bg-gradient-to-r from-brand-700 via-brand-500 to-brand-300 shadow-[0_0_6px_rgba(124,58,237,0.6)]"
              : "bg-gradient-to-r from-cyan-700 via-cyan-500 to-cyan-300 shadow-[0_0_6px_rgba(6,182,212,0.55)]"
          }`}
          style={{ width: `${filled}%` }}
        />
      </div>
    </div>
  );
}

function RoundRevealOverlay({
  reveal,
  onDismiss,
}: {
  reveal: RoundReveal;
  onDismiss: () => void;
}) {
  const isA = reveal.winner === "A";
  const isTie = reveal.winner === "TIE";

  const bg = isTie
    ? "from-amber-950/95 via-black/90 to-black/95"
    : isA
      ? "from-brand-950/95 via-black/90 to-black/95"
      : "from-cyan-950/95 via-black/90 to-black/95";

  const accent = isTie ? "text-amber-300" : isA ? "text-brand-300" : "text-cyan-300";
  const glow = isTie
    ? "0 0 80px rgba(245,158,11,0.4)"
    : isA
      ? "0 0 80px rgba(124,58,237,0.5)"
      : "0 0 80px rgba(6,182,212,0.45)";

  const badge = isTie ? "🤝" : "🏆";

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-b ${bg} backdrop-blur-sm`}
      onClick={onDismiss}
      role="dialog"
      aria-modal
      aria-label={`Round ${reveal.roundNumber} result`}
    >
      {/* Background glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ boxShadow: `inset 0 0 120px 40px ${isTie ? "rgba(245,158,11,0.15)" : isA ? "rgba(124,58,237,0.2)" : "rgba(6,182,212,0.18)"}` }}
      />

      <div className="relative flex flex-col items-center text-center px-8" style={{ textShadow: glow }}>
        {/* Round label */}
        <span className="mb-4 rounded-full border border-white/10 bg-black/40 px-5 py-1.5 text-[10px] font-black uppercase tracking-[0.4em] text-white/50 backdrop-blur">
          Round {reveal.roundNumber} Result
        </span>

        {/* Trophy / icon */}
        <span className="mb-3 text-6xl drop-shadow-2xl">{badge}</span>

        {/* Winner name */}
        <h2 className={`text-5xl font-black leading-none tracking-tight md:text-7xl ${accent}`}>
          {isTie ? "Dead Heat" : reveal.winnerName}
        </h2>

        {/* Song */}
        <p className="mt-3 text-xl font-bold text-white/70 md:text-2xl">{reveal.songTitle}</p>

        {/* Vote split */}
        {reveal.totalVotes > 0 && (
          <div className="mt-5 flex items-center gap-4">
            <span className="text-sm font-black tabular-nums text-brand-300">{reveal.pctA}%</span>
            <div className="relative h-2 w-36 overflow-hidden rounded-full bg-white/10">
              <div
                className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400 transition-none"
                style={{ width: `${reveal.pctA}%` }}
              />
            </div>
            <span className="text-sm font-black tabular-nums text-cyan-300">{reveal.pctB}%</span>
          </div>
        )}
        {reveal.totalVotes > 0 && (
          <p className="mt-1.5 text-[11px] text-white/30 tabular-nums">{reveal.totalVotes} votes cast</p>
        )}

        <p className="mt-8 text-[11px] text-white/25">Tap anywhere to continue</p>
      </div>
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────
export default function VerzuzStage(props: Props) {
  const [rounds, setRounds] = useState<Round[]>(props.rounds);
  const [myVotes, setMyVotes] = useState<Record<number, string>>(props.myVotes);
  const [serverRound, setServerRound] = useState(props.currentRound);
  const [serverStatus, setServerStatus] = useState<Props["status"]>(props.status);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [realtimeState, setRealtimeState] = useState<string>("INIT");
  const [shareUrl, setShareUrl] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Audio preview
  const audioARef = useRef<HTMLAudioElement | null>(null);
  const audioBRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  // Reaction bursts
  const [bursts, setBursts] = useState<ReactionBurst[]>([]);
  const burstSeq = useRef(1);
  const burstTimeouts = useRef<number[]>([]);

  // NEW: viewer count (Supabase presence)
  const [viewerCount, setViewerCount] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const presenceChRef = useRef<any>(null);

  // NEW: crowd hype meters (0-100)
  const [hypoA, setHypeA] = useState(0);
  const [hypoB, setHypeB] = useState(0);

  // NEW: round winner reveal overlay
  const [roundReveal, setRoundReveal] = useState<RoundReveal | null>(null);
  const revealedRoundsRef = useRef(new Set<number>());
  const revealTimerRef = useRef<number>(0);
  const initialRevealSeedDone = useRef(false);

  useEffect(() => {
    try { setShareUrl(window.location.href); } catch { setShareUrl(""); }
  }, []);

  // 1Hz tick
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Hype decay: 3% per 500ms when not receiving reactions
  useEffect(() => {
    if (serverStatus !== "LIVE") return;
    const t = setInterval(() => {
      setHypeA((p) => Math.max(0, p - 3));
      setHypeB((p) => Math.max(0, p - 3));
    }, 500);
    return () => clearInterval(t);
  }, [serverStatus]);

  // Detect newly resolved rounds → trigger reveal overlay
  useEffect(() => {
    if (!initialRevealSeedDone.current) {
      // Seed: all rounds that already have winners on mount should NOT trigger reveals
      for (const r of rounds) {
        if (r.winner) revealedRoundsRef.current.add(r.roundNumber);
      }
      initialRevealSeedDone.current = true;
      return;
    }
    for (const r of rounds) {
      if (r.winner && !revealedRoundsRef.current.has(r.roundNumber)) {
        revealedRoundsRef.current.add(r.roundNumber);
        const total = r.votesA + r.votesB;
        const pA = total > 0 ? Math.round((r.votesA / total) * 100) : 50;
        const reveal: RoundReveal = {
          roundNumber: r.roundNumber,
          winner: r.winner,
          winnerName:
            r.winner === "A" ? props.artistA.name : r.winner === "B" ? props.artistB.name : "Tied",
          songTitle:
            r.winner === "A"
              ? r.songA.title
              : r.winner === "B"
                ? r.songB.title
                : `${r.songA.title} vs ${r.songB.title}`,
          pctA: pA,
          pctB: 100 - pA,
          totalVotes: total,
        };
        setRoundReveal(reveal);
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = window.setTimeout(() => setRoundReveal(null), 3500);
        break; // one at a time
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rounds]);

  // Supabase realtime: broadcasts + presence
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;

    const ch = supabase
      .channel(CHANNELS.versus(props.matchId))
      .on("broadcast", { event: "verzuz_vote" }, ({ payload }) => {
        const p = payload as { roundNumber: number; votesA: number; votesB: number };
        setRounds((prev) =>
          prev.map((r) => r.roundNumber === p.roundNumber ? { ...r, votesA: p.votesA, votesB: p.votesB } : r),
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
          closedRounds?: { roundNumber: number; winner: "A" | "B" | "TIE" }[];
        };
        if (typeof p.currentRound === "number") setServerRound(p.currentRound);
        if (p.status) setServerStatus(p.status);
        if (p.closedRounds && p.closedRounds.length > 0) {
          setRounds((prev) =>
            prev.map((r) => {
              const closed = p.closedRounds?.find((c) => c.roundNumber === r.roundNumber);
              return closed ? { ...r, winner: closed.winner } : r;
            }),
          );
        }
      })
      .on("presence", { event: "sync" }, () => {
        const state: Record<string, unknown[]> = presenceChRef.current?.presenceState?.() ?? {};
        const count = Object.values(state).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 1), 0);
        setViewerCount(count);
      })
      .subscribe(async (status) => {
        setRealtimeState(status);
        if (status === "SUBSCRIBED") {
          await presenceChRef.current?.track?.({ ts: Date.now() });
          const state: Record<string, unknown[]> = presenceChRef.current?.presenceState?.() ?? {};
          const count = Object.values(state).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 1), 0);
          setViewerCount(count);
        }
      });

    presenceChRef.current = ch;
    return () => { void supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.matchId]);

  // Poll fallback
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
            rounds: { roundNumber: number; votesA: number; votesB: number; winner: "A" | "B" | "TIE" | null }[];
          };
          myVotes: { roundNumber: number; votedSongId: string }[];
        };
        setServerStatus(data.match.status);
        setServerRound(data.match.currentRound);
        setRounds((prev) =>
          prev.map((r) => {
            const latest = data.match.rounds.find((x) => x.roundNumber === r.roundNumber);
            return latest ? { ...r, votesA: latest.votesA, votesB: latest.votesB, winner: latest.winner } : r;
          }),
        );
        setMyVotes(Object.fromEntries(data.myVotes.map((v) => [v.roundNumber, v.votedSongId])));
      } catch { /* ignore */ }
    }
    void pollOnce();
    const ms = realtimeState === "SUBSCRIBED" ? 30_000 : 6_000;
    const interval = setInterval(pollOnce, ms);
    return () => { cancelled = true; clearInterval(interval); };
  }, [props.matchId, realtimeState, serverStatus]);

  // Cleanup audio
  useEffect(() => {
    return () => {
      for (const ref of [audioARef, audioBRef]) {
        if (ref.current) { ref.current.pause(); ref.current.src = ""; ref.current = null; }
      }
      for (const t of burstTimeouts.current) clearTimeout(t);
      clearTimeout(revealTimerRef.current);
      burstTimeouts.current = [];
    };
  }, []);

  // ── derived values ──────────────────────────────────────────────────────────
  const startMs = useMemo(() => new Date(props.startsAt).getTime(), [props.startsAt]);
  const elapsedSec = Math.floor((now - startMs) / 1000);
  const computedRound = Math.min(props.totalRounds, Math.max(1, Math.floor(elapsedSec / props.roundDurationSec) + 1));
  const liveRoundNumber =
    serverStatus === "LIVE"
      ? Math.min(props.totalRounds, Math.max(1, serverRound || computedRound))
      : serverRound;
  const secondsIntoRound = Math.max(0, elapsedSec - (liveRoundNumber - 1) * props.roundDurationSec);
  const secondsLeft = Math.max(0, props.roundDurationSec - secondsIntoRound);
  const tickPct = (secondsIntoRound / props.roundDurationSec) * 100;
  const matchStarted = now >= startMs;
  const liveRound = rounds.find((r) => r.roundNumber === liveRoundNumber) ?? null;

  // Countdown to start
  const msUntilStart = Math.max(0, startMs - now);
  const cdHours = Math.floor(msUntilStart / 3_600_000);
  const cdMinutes = Math.floor((msUntilStart % 3_600_000) / 60_000);
  const cdSeconds = Math.floor((msUntilStart % 60_000) / 1000);

  const calendarUrl = useMemo(() => {
    const start = new Date(props.startsAt);
    const end = new Date(start.getTime() + props.totalRounds * props.roundDurationSec * 1000);
    const text = `Verzuz: ${props.artistA.name} vs ${props.artistB.name}`;
    const details = [props.theme ? `Theme: ${props.theme}` : null, shareUrl ? `Watch: ${shareUrl}` : null]
      .filter(Boolean).join("\n");
    const params = new URLSearchParams({ action: "TEMPLATE", text, dates: `${fmtCalUtc(start)}/${fmtCalUtc(end)}`, details });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }, [props.startsAt, props.totalRounds, props.roundDurationSec, props.artistA.name, props.artistB.name, props.theme, shareUrl]);

  const score = rounds.reduce(
    (acc, r) => {
      if (r.winner === "A") acc.aWins++;
      else if (r.winner === "B") acc.bWins++;
      else if (r.winner === "TIE") acc.ties++;
      return acc;
    },
    { aWins: 0, bWins: 0, ties: 0 },
  );
  const totalLiveVotes = liveRound ? liveRound.votesA + liveRound.votesB : 0;
  const pctA = liveRound && totalLiveVotes > 0 ? Math.round((liveRound.votesA / totalLiveVotes) * 100) : 50;
  const pctB = 100 - pctA;
  const myPick = liveRound ? myVotes[liveRound.roundNumber] : undefined;
  const winnerName =
    serverStatus === "COMPLETED"
      ? score.aWins > score.bWins ? props.artistA.name : score.bWins > score.aWins ? props.artistB.name : null
      : null;
  const transparency = {
    crowd: Math.round((hypoA + hypoB) / 2),
    voteVolume: Math.min(100, totalLiveVotes * 4),
    retention: serverStatus === "LIVE" ? Math.min(100, Math.round((secondsIntoRound / props.roundDurationSec) * 100)) : 100,
    trust: Math.max(70, 100 - Math.min(30, Math.round(viewerCount / 50))),
  };

  // ── audio preview ───────────────────────────────────────────────────────────
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
      } catch { /* older browsers */ }
      audio.addEventListener("ended", () => setPlayingId(null));
      audio.addEventListener("error", () => setPlayingId(null));
      ref.current = audio;
    }
    if (playingId === song.id) {
      ref.current.pause(); setPlayingId(null);
    } else {
      void ref.current.play().catch(() => setPlayingId(null));
      setPlayingId(song.id);
    }
  }

  // ── reaction bursts + hype ──────────────────────────────────────────────────
  function spawnBurst(emoji: string) {
    const id = burstSeq.current++;
    const xPct = 12 + Math.random() * 76;
    const burst: ReactionBurst = { id, emoji, xPct, phase: "enter" };
    setBursts((prev) => [...prev, burst].slice(-30));
    const t1 = window.setTimeout(() => {
      setBursts((prev) => prev.map((b) => (b.id === id ? { ...b, phase: "exit" as const } : b)));
    }, 20);
    const t2 = window.setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.id !== id));
    }, 1100);
    burstTimeouts.current.push(t1, t2);

    // Boost hype on a random side
    const boost = 8 + Math.random() * 12;
    if (Math.random() < 0.5) setHypeA((p) => Math.min(100, p + boost));
    else setHypeB((p) => Math.min(100, p + boost));
  }

  async function sendReaction(emoji: string) {
    if (!props.isAuthed || serverStatus !== "LIVE") return;
    spawnBurst(emoji);
    try {
      await fetch(`/api/verzuz/${props.matchId}/reaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
    } catch { /* ignore */ }
  }

  // ── voting ──────────────────────────────────────────────────────────────────
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
        prev.map((r) => r.roundNumber === data.roundNumber ? { ...r, votesA: data.votesA, votesB: data.votesB } : r),
      );
      setMyVotes((prev) => ({ ...prev, [data.roundNumber]: songId }));
      // Voting boosts hype for the chosen side
      if (songId === liveRound.songA.id) setHypeA((p) => Math.min(100, p + 6));
      else setHypeB((p) => Math.min(100, p + 6));
    } finally {
      setBusy(false);
    }
  }

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Equalizer CSS keyframes */}
      <style>{`
        @keyframes eq { 0%,100%{transform:scaleY(.25)} 50%{transform:scaleY(1)} }
      `}</style>

      {/* Round winner reveal overlay */}
      {roundReveal && (
        <RoundRevealOverlay reveal={roundReveal} onDismiss={() => setRoundReveal(null)} />
      )}

      <div className="relative min-h-screen overflow-hidden bg-[#06060a]">
        {/* Mobile sticky round indicator */}
        {serverStatus === "LIVE" && liveRound && (
          <div className="sticky top-[57px] z-30 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-red-500/25 bg-black/85 px-3 py-2 shadow-2xl backdrop-blur-sm md:hidden">
            <span className="flex h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.9)]" aria-hidden />
            <span className="text-[10px] font-black uppercase tracking-widest text-white/60">
              Round {liveRound.roundNumber}/{props.totalRounds}
            </span>
            {viewerCount > 1 && (
              <span className="text-[10px] text-white/30 tabular-nums">👁 {viewerCount}</span>
            )}
            <span className="ml-auto font-mono text-sm font-black tabular-nums text-white">{fmt(secondsLeft)}</span>
          </div>
        )}

        {/* 3D stage backdrop */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <StageBackdrop3D
            status={serverStatus}
            artistA={props.artistA.name}
            artistB={props.artistB.name}
            theme={props.theme}
          />
        </div>

        {/* CSS atmosphere */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 55% at 20% 35%,rgba(109,40,217,.38) 0%,transparent 60%)," +
              "radial-gradient(ellipse 60% 55% at 80% 65%,rgba(6,182,212,.32) 0%,transparent 60%)," +
              "radial-gradient(ellipse 40% 30% at 50% 0%,rgba(0,0,0,.7) 0%,transparent 100%)," +
              "linear-gradient(180deg,rgba(6,6,10,.3) 0%,rgba(8,6,18,.75) 55%,rgba(6,6,10,1) 100%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[55vh] mix-blend-screen opacity-30"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,255,255,.018) 2px,rgba(255,255,255,.018) 4px)",
          }}
        />

        {/* Reaction bursts */}
        <div aria-hidden className="pointer-events-none absolute inset-0 z-20">
          {bursts.map((b) => (
            <span
              key={b.id}
              className={`absolute bottom-[28%] text-3xl drop-shadow-[0_6px_20px_rgba(0,0,0,0.8)] transition-[transform,opacity] duration-[1100ms] ease-out transform-gpu ${
                b.phase === "enter" ? "translate-y-0 scale-100 opacity-100" : "-translate-y-28 scale-125 opacity-0"
              }`}
              style={{ left: `${b.xPct}%` }}
            >
              {b.emoji}
            </span>
          ))}
        </div>

        <div className="relative mx-auto max-w-6xl px-4 py-10">

          {/* ═══════════════ HERO HEADER ═══════════════ */}
          <div className="mb-10 flex flex-col items-center text-center">
            {/* Status + viewer count badges */}
            <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
              <span
                className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.3em] backdrop-blur ${
                  serverStatus === "LIVE"
                    ? "border-red-500/40 bg-red-950/50 text-red-300 shadow-[0_0_20px_rgba(239,68,68,0.25)]"
                    : serverStatus === "SCHEDULED"
                      ? "border-brand-500/30 bg-brand-950/40 text-brand-300"
                      : "border-white/10 bg-black/35 text-white/45"
                }`}
              >
                {serverStatus === "LIVE" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />}
                {serverStatus === "LIVE" ? "Live Verzuz" : serverStatus === "SCHEDULED" ? "Verzuz · Scheduled" : "Verzuz · Ended"}
              </span>
              {viewerCount > 1 && serverStatus === "LIVE" && (
                <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-[10px] font-bold text-white/45 backdrop-blur">
                  <span className="text-[11px]">👁</span>
                  {viewerCount.toLocaleString()} watching
                </span>
              )}
              {props.theme && (
                <span className="rounded-full border border-white/12 bg-black/30 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white/45 backdrop-blur">
                  {props.theme}
                </span>
              )}
            </div>

            {/* Artist avatars + VS with tension line */}
            <div className="mb-5 flex items-center justify-center">
              {/* Side A */}
              <div className="flex flex-col items-center gap-2 w-28 md:w-36">
                <div className="relative h-16 w-16 md:h-24 md:w-24 overflow-hidden rounded-full border-2 border-brand-500/60 shadow-[0_0_28px_rgba(124,58,237,0.55)]">
                  {props.artistA.image ? (
                    <Image src={props.artistA.image} alt={props.artistA.name} fill unoptimized className="object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-900 to-brand-700 text-2xl font-black text-white/70">
                      {props.artistA.name.charAt(0)}
                    </div>
                  )}
                  <div className="absolute inset-0 rounded-full ring-1 ring-brand-400/30" />
                </div>
                <div className="text-center">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-brand-400/80">Side A</p>
                  {props.artistA.studioUsername ? (
                    <Link href={`/studio/${props.artistA.studioUsername}`} className="hover:text-brand-300 transition">
                      <p className="text-sm font-black text-white md:text-base">
                        {props.artistA.name}
                        {props.artistA.isVerified && <span className="ml-1 text-xs text-cyan-300">✓</span>}
                      </p>
                    </Link>
                  ) : (
                    <p className="text-sm font-black text-white md:text-base">
                      {props.artistA.name}
                      {props.artistA.isVerified && <span className="ml-1 text-xs text-cyan-300">✓</span>}
                    </p>
                  )}
                </div>
              </div>

              {/* Tension line + VS */}
              <div className="flex items-center gap-0 mx-2 md:mx-4">
                {/* Line A→VS */}
                <svg width="36" height="8" className="hidden md:block" aria-hidden>
                  <defs>
                    <linearGradient id="lgA" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#7c3aed" stopOpacity="0" />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity="0.55" />
                    </linearGradient>
                  </defs>
                  <line x1="0" y1="4" x2="36" y2="4" stroke="url(#lgA)" strokeWidth="1.5" strokeDasharray="3 2">
                    <animate attributeName="stroke-dashoffset" from="0" to="-5" dur="0.35s" repeatCount="indefinite" />
                  </line>
                </svg>

                {/* VS circle */}
                <div className="relative flex h-12 w-12 items-center justify-center md:h-14 md:w-14 flex-shrink-0">
                  <div className="absolute inset-0 rounded-full bg-red-600/15 blur-md" />
                  <div
                    className="absolute inset-0 rounded-full border border-red-500/30"
                    style={{ animation: serverStatus === "LIVE" ? "vsPulse 2.5s ease-in-out infinite" : "none" }}
                  />
                  <span
                    className="relative text-lg font-black tracking-widest text-white/90 md:text-xl"
                    style={{ textShadow: "0 0 20px rgba(239,68,68,0.65),0 0 40px rgba(239,68,68,0.3)" }}
                  >
                    VS
                  </span>
                </div>

                {/* Line VS→B */}
                <svg width="36" height="8" className="hidden md:block" aria-hidden>
                  <defs>
                    <linearGradient id="lgB" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity="0.55" />
                      <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <line x1="0" y1="4" x2="36" y2="4" stroke="url(#lgB)" strokeWidth="1.5" strokeDasharray="3 2">
                    <animate attributeName="stroke-dashoffset" from="0" to="-5" dur="0.35s" repeatCount="indefinite" />
                  </line>
                </svg>
              </div>

              {/* Side B */}
              <div className="flex flex-col items-center gap-2 w-28 md:w-36">
                <div className="relative h-16 w-16 md:h-24 md:w-24 overflow-hidden rounded-full border-2 border-cyan-500/60 shadow-[0_0_28px_rgba(6,182,212,0.5)]">
                  {props.artistB.image ? (
                    <Image src={props.artistB.image} alt={props.artistB.name} fill unoptimized className="object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-cyan-900 to-cyan-700 text-2xl font-black text-white/70">
                      {props.artistB.name.charAt(0)}
                    </div>
                  )}
                  <div className="absolute inset-0 rounded-full ring-1 ring-cyan-400/30" />
                </div>
                <div className="text-center">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-400/80">Side B</p>
                  {props.artistB.studioUsername ? (
                    <Link href={`/studio/${props.artistB.studioUsername}`} className="hover:text-cyan-300 transition">
                      <p className="text-sm font-black text-white md:text-base">
                        {props.artistB.name}
                        {props.artistB.isVerified && <span className="ml-1 text-xs text-cyan-300">✓</span>}
                      </p>
                    </Link>
                  ) : (
                    <p className="text-sm font-black text-white md:text-base">
                      {props.artistB.name}
                      {props.artistB.isVerified && <span className="ml-1 text-xs text-cyan-300">✓</span>}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* VS keyframe */}
            <style>{`
              @keyframes vsPulse {
                0%,100%{box-shadow:0 0 8px rgba(239,68,68,0.25),inset 0 0 8px rgba(239,68,68,0.1)}
                50%{box-shadow:0 0 24px rgba(239,68,68,0.5),inset 0 0 14px rgba(239,68,68,0.2)}
              }
            `}</style>

            <p className="text-xs text-white/35 tracking-wider">
              {props.totalRounds} rounds · {Math.round(props.roundDurationSec / 60)} min each
            </p>

            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => { if (!shareUrl) return; void navigator.clipboard.writeText(shareUrl).catch(() => {}); }}
                disabled={!shareUrl}
                className="rounded-xl border border-white/12 bg-white/5 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-white/65 backdrop-blur hover:bg-white/10 hover:text-white transition disabled:opacity-40"
              >
                Copy link
              </button>
              {serverStatus === "SCHEDULED" && (
                <a href={calendarUrl} target="_blank" rel="noopener noreferrer"
                  className="rounded-xl border border-amber-400/30 bg-amber-400/8 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-amber-200 hover:bg-amber-400/15 transition">
                  Add to calendar
                </a>
              )}
            </div>
          </div>

          {/* ═══════════════ SCOREBOARD ═══════════════ */}
          <div className="mb-6 overflow-hidden rounded-2xl border border-white/8 bg-black/55 shadow-2xl backdrop-blur-md">
            <div className="h-[2px] w-full bg-gradient-to-r from-brand-500 via-red-500 to-cyan-500 opacity-70" />
            <div className="grid grid-cols-3 items-stretch gap-3 p-4">
              {/* Side A */}
              <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-brand-500/20 bg-brand-500/8 px-3 py-4">
                <span className="text-[9px] font-black uppercase tracking-[0.3em] text-brand-400/70">Side A</span>
                <span className="text-3xl font-black tabular-nums text-white md:text-4xl">{score.aWins}</span>
                <span className="text-[10px] font-bold text-white/40 truncate max-w-[7rem] text-center">{props.artistA.name}</span>
              </div>

              {/* Center */}
              <div className="flex flex-col items-center justify-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/35">
                  {serverStatus === "LIVE"
                    ? `Round ${liveRound?.roundNumber ?? props.currentRound} of ${props.totalRounds}`
                    : `${props.totalRounds} Rounds`}
                </span>

                {serverStatus === "LIVE" && (
                  <>
                    <span className="font-mono text-3xl font-black tabular-nums text-white md:text-4xl">{fmt(secondsLeft)}</span>
                    <div className="relative h-1 w-24 overflow-hidden rounded-full bg-white/8">
                      <div
                        className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-brand-500 to-red-500 transition-all duration-1000"
                        style={{ width: `${tickPct}%` }}
                      />
                    </div>
                  </>
                )}

                {/* ── Scheduled countdown ── */}
                {serverStatus === "SCHEDULED" && !matchStarted && (
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/30">Starts in</p>
                    <div className="flex items-end gap-1.5">
                      {cdHours > 0 && <><CountdownUnit value={cdHours} label="Hrs" /><span className="mb-3 text-white/25 font-black text-lg">:</span></>}
                      <CountdownUnit value={cdMinutes} label="Min" />
                      <span className="mb-3 text-white/25 font-black text-lg">:</span>
                      <CountdownUnit value={cdSeconds} label="Sec" />
                    </div>
                  </div>
                )}
                {serverStatus === "SCHEDULED" && matchStarted && (
                  <p className="text-xs font-bold text-white/55">Starting…</p>
                )}

                {/* ── COMPLETED result ── */}
                {serverStatus === "COMPLETED" && (
                  <div className="flex flex-col items-center gap-1">
                    {winnerName ? (
                      <>
                        <span className="text-2xl">🏆</span>
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">{winnerName}</p>
                        <p className="text-[9px] text-white/35">took it</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-black text-white/65">Tied</p>
                        <p className="text-[10px] text-white/35">{score.aWins}–{score.bWins}</p>
                      </>
                    )}
                  </div>
                )}
                {score.ties > 0 && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-bold text-white/35">
                    {score.ties} tied
                  </span>
                )}
              </div>

              {/* Side B */}
              <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-cyan-500/20 bg-cyan-500/8 px-3 py-4">
                <span className="text-[9px] font-black uppercase tracking-[0.3em] text-cyan-400/70">Side B</span>
                <span className="text-3xl font-black tabular-nums text-white md:text-4xl">{score.bWins}</span>
                <span className="text-[10px] font-bold text-white/40 truncate max-w-[7rem] text-center">{props.artistB.name}</span>
              </div>
            </div>
          </div>

          {/* Access notices */}
          {!props.isAuthed && (
            <div className="mb-6 flex items-center gap-3 rounded-2xl border border-white/8 bg-white/4 px-5 py-3 backdrop-blur">
              <span className="text-xl">🗳️</span>
              <p className="text-xs text-white/55">
                <Link href="/auth/signin" className="font-bold text-brand-400 hover:underline">Sign in</Link>{" "}to vote on the live round.
              </p>
            </div>
          )}
          {props.isViewerArtist && (
            <div className="mb-6 flex items-center gap-3 rounded-2xl border border-white/8 bg-white/4 px-5 py-3 backdrop-blur">
              <span className="text-xl">🎤</span>
              <p className="text-xs text-white/55">You&apos;re in this match — sit back, the audience decides.</p>
            </div>
          )}
          {voteError && (
            <div className="mb-6 rounded-2xl border border-red-500/25 bg-red-500/8 px-5 py-3 text-xs text-red-300 backdrop-blur">
              {voteError}
            </div>
          )}

          {/* Reactions + hype meters */}
          {serverStatus === "LIVE" && (
            <div className="mb-6 space-y-4">
              {props.isAuthed && (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {["🔥", "👏", "🐐", "💥", "😤"].map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => void sendReaction(e)}
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xl backdrop-blur hover:scale-110 hover:bg-white/10 active:scale-95 transition-transform"
                      aria-label={`React ${e}`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
              {/* Crowd hype meters */}
              <div className="rounded-2xl border border-white/8 bg-black/35 px-4 py-3 backdrop-blur">
                <p className="mb-2 text-center text-[9px] font-black uppercase tracking-[0.3em] text-white/25">Crowd Energy</p>
                <div className="grid grid-cols-2 gap-4">
                  <HypeBar side="A" pct={hypoA} name={props.artistA.name} />
                  <HypeBar side="B" pct={hypoB} name={props.artistB.name} />
                </div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-black/35 px-4 py-3 backdrop-blur">
                <p className="mb-2 text-center text-[9px] font-black uppercase tracking-[0.3em] text-white/25">Why This Round Is Ranked</p>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-white/70 md:grid-cols-4">
                  <div className="rounded-lg bg-white/5 px-2 py-1.5">Crowd: <span className="font-bold text-cyan-200">{transparency.crowd}</span></div>
                  <div className="rounded-lg bg-white/5 px-2 py-1.5">Votes: <span className="font-bold text-violet-200">{transparency.voteVolume}</span></div>
                  <div className="rounded-lg bg-white/5 px-2 py-1.5">Retention: <span className="font-bold text-emerald-200">{transparency.retention}</span></div>
                  <div className="rounded-lg bg-white/5 px-2 py-1.5">Trust: <span className="font-bold text-amber-200">{transparency.trust}</span></div>
                </div>
                <p className="mt-2 text-[10px] text-white/35">
                  Paid boosts are capped and flagged. Vote trust weighting suppresses suspicious bursts.
                </p>
              </div>
            </div>
          )}

          {/* ═══════════════ SONG CARDS ═══════════════ */}
          {liveRound ? (
            <>
              <div className="mb-3 grid gap-4 md:grid-cols-2">
                <SongSide
                  side="A" song={liveRound.songA} artist={props.artistA}
                  votes={liveRound.votesA}
                  picked={myPick === liveRound.songA.id}
                  isPreviewing={playingId === liveRound.songA.id}
                  onPreview={() => togglePreview("A", liveRound.songA)}
                  onVote={() => vote(liveRound.songA.id)}
                  disabled={busy || props.isViewerArtist || !props.isAuthed || serverStatus !== "LIVE"}
                />
                <SongSide
                  side="B" song={liveRound.songB} artist={props.artistB}
                  votes={liveRound.votesB}
                  picked={myPick === liveRound.songB.id}
                  isPreviewing={playingId === liveRound.songB.id}
                  onPreview={() => togglePreview("B", liveRound.songB)}
                  onVote={() => vote(liveRound.songB.id)}
                  disabled={busy || props.isViewerArtist || !props.isAuthed || serverStatus !== "LIVE"}
                />
              </div>

              {/* Head-to-head split bar */}
              <div className="mb-10 rounded-2xl border border-white/8 bg-black/40 px-4 py-3 backdrop-blur">
                <div className="mb-2 flex items-baseline justify-between text-xs font-black">
                  <span className="text-brand-300">{pctA}%</span>
                  <span className="text-[10px] font-bold text-white/30 tabular-nums">
                    {totalLiveVotes > 0 ? `${totalLiveVotes} votes` : "No votes yet"}
                  </span>
                  <span className="text-cyan-300">{pctB}%</span>
                </div>
                <div className="relative flex h-3 w-full overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full bg-gradient-to-r from-brand-700 to-brand-400 shadow-[0_0_8px_rgba(124,58,237,0.5)] transition-all duration-700"
                    style={{ width: `${pctA}%` }}
                  />
                  <div
                    className="h-full bg-gradient-to-l from-cyan-700 to-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.45)] transition-all duration-700"
                    style={{ width: `${pctB}%` }}
                  />
                  {/* Center marker */}
                  <div className="absolute left-1/2 top-0 h-full w-px -translate-x-px bg-white/20" />
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-white/30 font-bold">
                  <span>{props.artistA.name}</span>
                  <span>{props.artistB.name}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="mb-10 flex flex-col items-center justify-center gap-3 rounded-3xl border border-white/8 bg-black/35 py-14 text-center backdrop-blur">
              <span className="text-4xl">{matchStarted ? "⏳" : "🕐"}</span>
              <p className="text-sm font-bold text-white/45">{matchStarted ? "Round loading…" : "Verzuz hasn't started yet."}</p>
            </div>
          )}

          {/* ═══════════════ ROUND LADDER ═══════════════ */}
          <div className="overflow-hidden rounded-2xl border border-white/8 bg-black/40 backdrop-blur-md">
            <div className="border-b border-white/6 px-5 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/35">Round Card</p>
            </div>
            <ol className="divide-y divide-white/5">
              {rounds.map((r) => {
                const isLive = serverStatus === "LIVE" && r.roundNumber === liveRoundNumber;
                const winnerSide = r.winner;
                const winnerLabel =
                  r.winner === "A" ? props.artistA.name
                  : r.winner === "B" ? props.artistB.name
                  : r.winner === "TIE" ? "Tie"
                  : null;
                const total = r.votesA + r.votesB;
                const rPctA = total > 0 ? Math.round((r.votesA / total) * 100) : null;
                const rPctB = rPctA !== null ? 100 - rPctA : null;

                return (
                  <li
                    key={r.roundNumber}
                    className={`flex items-center gap-4 px-5 py-3 text-xs transition ${
                      isLive ? "bg-red-950/20" : r.winner ? "bg-white/[0.02]" : "opacity-50"
                    }`}
                  >
                    {/* Round number circle */}
                    <span
                      className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-black tabular-nums ${
                        isLive
                          ? "bg-red-500 text-white shadow-[0_0_12px_rgba(239,68,68,0.6)]"
                          : r.winner ? "bg-white/12 text-white/80" : "bg-white/6 text-white/35"
                      }`}
                    >
                      {r.roundNumber}
                    </span>

                    {/* Song matchup */}
                    <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                      <span className={`truncate font-bold ${winnerSide === "A" ? "text-brand-300" : "text-white/65"}`}>
                        {r.songA.title}
                      </span>
                      <span className="flex-shrink-0 text-[10px] font-black text-white/25">vs</span>
                      <span className={`truncate font-bold ${winnerSide === "B" ? "text-cyan-300" : "text-white/65"}`}>
                        {r.songB.title}
                      </span>
                    </span>

                    {/* Vote split percentage */}
                    {r.winner && rPctA !== null && rPctB !== null && total > 0 && (
                      <span className="flex-shrink-0 text-[9px] font-bold tabular-nums text-white/30">
                        <span className={winnerSide === "A" ? "text-brand-400/70" : ""}>{rPctA}</span>
                        <span className="text-white/20">–</span>
                        <span className={winnerSide === "B" ? "text-cyan-400/70" : ""}>{rPctB}</span>
                      </span>
                    )}

                    {/* Result badge */}
                    {winnerLabel && (
                      <span
                        className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest ${
                          r.winner === "TIE"
                            ? "bg-white/8 text-white/50"
                            : r.winner === "A" ? "bg-brand-500/20 text-brand-300" : "bg-cyan-500/20 text-cyan-300"
                        }`}
                      >
                        {r.winner === "TIE" ? "Tie" : winnerLabel}
                      </span>
                    )}
                    {isLive && (
                      <span className="flex flex-shrink-0 items-center gap-1 rounded-full bg-red-500/20 px-2.5 py-0.5 text-[10px] font-black text-red-300">
                        <span className="h-1 w-1 animate-pulse rounded-full bg-red-400" />
                        Live
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── SongSide card ────────────────────────────────────────────────────────────
function SongSide({
  side, song, artist, votes, picked, isPreviewing, onPreview, onVote, disabled,
}: {
  side: "A" | "B";
  song: SongSummary;
  artist: ArtistSummary;
  votes: number;
  picked: boolean;
  isPreviewing: boolean;
  onPreview: () => void;
  onVote: () => void;
  disabled: boolean;
}) {
  const isA = side === "A";
  const borderPicked = picked
    ? isA
      ? "border-brand-400/70 shadow-[0_0_30px_rgba(124,58,237,0.35)]"
      : "border-cyan-400/70 shadow-[0_0_30px_rgba(6,182,212,0.30)]"
    : "border-white/8";

  return (
    <div className={`group relative overflow-hidden rounded-3xl border bg-black/55 backdrop-blur-md transition-all duration-300 ${borderPicked}`}>
      {/* Top accent line */}
      <div
        className={`absolute inset-x-0 top-0 h-[2px] ${
          isA ? "bg-gradient-to-r from-brand-600 via-brand-400 to-transparent"
               : "bg-gradient-to-l from-cyan-600 via-cyan-400 to-transparent"
        }`}
      />

      {/* Full-bleed artwork */}
      <div className="relative h-56 w-full overflow-hidden md:h-64">
        {song.coverUrl ? (
          <Image
            src={song.coverUrl} alt="" fill unoptimized
            className="object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div
            className={`flex h-full w-full items-center justify-center text-7xl ${
              isA ? "bg-gradient-to-br from-brand-950 via-brand-900 to-[#0d0820]"
                  : "bg-gradient-to-bl from-cyan-950 via-cyan-900 to-[#041014]"
            }`}
          >
            🎵
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />

        {/* Side badge */}
        <div className="absolute left-3 top-3 flex items-center gap-2">
          <span
            className={`rounded-lg px-2.5 py-1 text-[10px] font-black tracking-widest uppercase backdrop-blur ${
              isA
                ? "bg-brand-500/85 text-white shadow-[0_2px_12px_rgba(124,58,237,0.6)]"
                : "bg-cyan-500/85 text-white shadow-[0_2px_12px_rgba(6,182,212,0.55)]"
            }`}
          >
            Side {side}
          </span>
          {picked && (
            <span className="rounded-lg bg-white/15 px-2 py-1 text-[10px] font-black tracking-widest text-white backdrop-blur">
              Your pick
            </span>
          )}
        </div>

        {/* Equalizer bars while previewing */}
        {isPreviewing && (
          <div className="absolute right-3 top-3 flex items-end gap-[2px]" aria-hidden>
            {EQ_H.map((h, i) => (
              <div
                key={i}
                className={`w-[3px] origin-bottom rounded-sm ${isA ? "bg-brand-400" : "bg-cyan-400"} opacity-90`}
                style={{
                  height: `${h * 22}px`,
                  animation: `eq ${EQ_D[i]}ms ease-in-out infinite`,
                  animationDelay: `${i * 55}ms`,
                }}
              />
            ))}
          </div>
        )}

        {/* Artist avatar */}
        <div className="absolute bottom-3 right-3">
          <div
            className={`relative h-10 w-10 overflow-hidden rounded-full border-2 shadow-lg ${
              isA ? "border-brand-400/70" : "border-cyan-400/70"
            }`}
          >
            {artist.image ? (
              <Image src={artist.image} alt={artist.name} fill unoptimized className="object-cover" />
            ) : (
              <div className={`flex h-full w-full items-center justify-center text-sm font-black text-white/80 ${isA ? "bg-brand-800" : "bg-cyan-800"}`}>
                {artist.name.charAt(0)}
              </div>
            )}
          </div>
        </div>

        {/* Song info overlay */}
        <div className="absolute inset-x-0 bottom-0 px-4 pb-4">
          <p className={`text-[10px] font-black uppercase tracking-[0.22em] ${isA ? "text-brand-300" : "text-cyan-300"}`}>
            {artist.name}
            {artist.isVerified && <span className="ml-1 text-cyan-300">✓</span>}
          </p>
          <h2 className="mt-0.5 text-xl font-black leading-tight text-white drop-shadow-lg md:text-2xl">{song.title}</h2>
          {(song.genre || song.bpm) && (
            <p className="mt-0.5 text-xs text-white/50">
              {song.genre ?? ""}{song.genre && song.bpm ? " · " : ""}{song.bpm ? `${song.bpm} BPM` : ""}
            </p>
          )}
        </div>
      </div>

      {/* Bottom panel */}
      <div className="px-4 pb-4 pt-3">
        {/* Preview + open */}
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={onPreview}
            aria-label={isPreviewing ? `Pause ${song.title}` : `Preview ${song.title}`}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-black uppercase tracking-widest transition ${
              isPreviewing
                ? isA ? "border-brand-400/50 bg-brand-500/20 text-brand-200"
                       : "border-cyan-400/50 bg-cyan-500/20 text-cyan-200"
                : "border-white/10 bg-white/5 text-white/65 hover:bg-white/10 hover:text-white"
            }`}
          >
            <span>{isPreviewing ? "⏸" : "▶"}</span>
            {isPreviewing ? "Pause" : "Preview"}
          </button>
          <Link
            href={`/track/${song.id}`}
            className="flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-bold text-white/50 hover:bg-white/10 hover:text-white transition"
          >
            Open
          </Link>
        </div>

        {/* Vote count */}
        <p className="mb-2 text-right text-[10px] font-bold tabular-nums text-white/35">
          {votes} {votes === 1 ? "vote" : "votes"}
        </p>

        {/* Vote button */}
        <button
          type="button"
          onClick={onVote}
          disabled={disabled}
          className={`relative w-full overflow-hidden rounded-2xl py-3.5 text-sm font-black uppercase tracking-[0.2em] text-white transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
            picked
              ? isA
                ? "bg-gradient-to-r from-brand-600 to-brand-500 shadow-[0_4px_24px_rgba(124,58,237,0.45)]"
                : "bg-gradient-to-r from-cyan-600 to-cyan-500 shadow-[0_4px_24px_rgba(6,182,212,0.4)]"
              : isA
                ? "border border-brand-500/35 bg-brand-500/10 hover:bg-brand-500/20 hover:shadow-[0_0_20px_rgba(124,58,237,0.25)]"
                : "border border-cyan-500/35 bg-cyan-500/10 hover:bg-cyan-500/20 hover:shadow-[0_0_20px_rgba(6,182,212,0.22)]"
          }`}
        >
          {picked ? "✓ Your Pick" : `Vote Side ${side}`}
        </button>
      </div>
    </div>
  );
}
