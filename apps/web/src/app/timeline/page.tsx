import { auth } from "@/lib/auth";
import FeedClient from "@/app/feed/FeedClient";
import ProductionTimeline from "@/components/daw/ProductionTimeline";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Timeline · Epic Music Space",
  description:
    "Your hybrid activity feed — drops from creators you follow, live sessions, battles, and community updates all in one place.",
};

const QUICK_LINKS = [
  { href: "/studio", icon: "🎛️", label: "Studio", sub: "Create & publish" },
  { href: "/versus", icon: "⚔️", label: "Battles", sub: "Vote & compete" },
  { href: "/studio/live", icon: "🎙️", label: "Sessions", sub: "Live rooms" },
];

type Props = {
  searchParams: Promise<{ battle?: string; focus?: string; recap?: string }>;
};

export default async function TimelinePage({ searchParams }: Props) {
  const { battle, focus, recap } = await searchParams;
  const session = await auth();
  const isAuthed = Boolean(session?.user?.id);
  const battleId = (battle ?? "").trim();
  const focusMode = (focus ?? "").trim().toLowerCase();
  const recapPrefill = (recap ?? "").trim();

  let battleContext: {
    href: string;
    title: string;
    subtitle: string;
  } | null = null;

  if (battleId) {
    const [match, royale] = await Promise.all([
      prisma.versusMatch.findUnique({
        where: { id: battleId },
        select: {
          id: true,
          votesA: true,
          votesB: true,
          songA: { select: { title: true, artist: true } },
          songB: { select: { title: true, artist: true } },
        },
      }),
      prisma.battleRoyale.findUnique({
        where: { id: battleId },
        select: {
          id: true,
          entries: {
            select: { votes: true, song: { select: { title: true, artist: true } } },
            orderBy: [{ votes: "desc" }],
            take: 2,
          },
        },
      }),
    ]);

    if (match) {
      const winner = match.votesA >= match.votesB ? match.songA : match.songB;
      const loser = winner.title === match.songA.title ? match.songB : match.songA;
      const winnerVotes = Math.max(match.votesA, match.votesB);
      const loserVotes = Math.min(match.votesA, match.votesB);
      battleContext = {
        href: `/versus/${match.id}`,
        title: `${winner.title} beat ${loser.title}`,
        subtitle: `${winner.artist} won ${winnerVotes}-${loserVotes}. Drop your take while the reaction is hot.`,
      };
    } else if (royale) {
      const first = royale.entries[0];
      const second = royale.entries[1];
      battleContext = {
        href: `/versus/royale/${royale.id}`,
        title: first
          ? `${first.song.title} took the royale crown`
          : "Royale recap",
        subtitle: first
          ? `${first.song.artist}${second ? ` edged out ${second.song.title}` : " finished on top"}. Post your recap while the room is still active.`
          : "Post your recap while the room is still active.",
      };
    }
  }

  return (
    <div className="ems-shell pb-[calc(env(safe-area-inset-bottom)+5rem)]">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="ems-head">
        <p className="ems-kicker">Timeline</p>
        <h1 className="ems-title">Your Feed</h1>
        <p className="ems-sub">
          Drops, battles, and live sessions from the community — plus your own
          activity in one stream.
        </p>
        <div className="ems-divider" aria-hidden />
      </div>

      {battleContext && (
        <div className="mb-5 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200/90">
            Battle Recap Context
          </p>
          <p className="mt-1 text-sm font-semibold text-white">{battleContext.title}</p>
          <p className="mt-1 text-xs text-white/65">{battleContext.subtitle}</p>
          <Link
            href={battleContext.href}
            className="mt-2 inline-flex rounded-lg border border-cyan-300/35 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-cyan-100 hover:bg-cyan-500/20"
          >
            Open Battle Card
          </Link>
        </div>
      )}

      {focusMode === "debate" && (
        <div className="mb-5 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
          <p className="text-xs text-amber-100">
            Debate mode is active. Share what decided the result: arrangement,
            mix, hook, or energy.
          </p>
        </div>
      )}

      {recapPrefill && (
        <div className="mb-5 rounded-2xl border border-brand-500/35 bg-brand-500/10 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-200/90">
            Recap Draft Loaded
          </p>
          <p className="mt-1 text-xs text-white/70">
            We prefilled your composer with a battle recap draft. Edit before posting.
          </p>
        </div>
      )}

      {/* ── Quick-action strip ──────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-3 gap-2">
        {QUICK_LINKS.map(({ href, icon, label, sub }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.03] px-2 py-3 text-center transition hover:border-white/20 hover:bg-white/6"
          >
            <span className="text-xl leading-none" aria-hidden>{icon}</span>
            <span className="text-xs font-bold text-white/85">{label}</span>
            <span className="text-[10px] text-white/40">{sub}</span>
          </Link>
        ))}
      </div>

      {/* ── Sign-in nudge for anonymous visitors ───────────────────────── */}
      {!isAuthed && (
        <div className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-brand-500/25 bg-brand-500/8 px-4 py-3">
          <p className="text-sm text-white/70">
            <span className="font-semibold text-brand-300">Sign in</span> to see
            drops from creators you follow and your personal activity.
          </p>
          <Link
            href="/auth/signin?callbackUrl=/timeline"
            className="shrink-0 rounded-lg bg-brand-500 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-brand-600"
          >
            Sign in
          </Link>
        </div>
      )}

      {/* ── Feed ───────────────────────────────────────────────────────── */}
      {/* ── Production Timeline ────────────────────────────────────────── */}
      <ProductionTimeline />

      {/* ── Community Feed ──────────────────────────────────────────────── */}
      <FeedClient
        initialMode={isAuthed ? "following" : "all"}
        viewerId={session?.user?.id ?? null}
        onboarding={null}
        authCallbackPath="/timeline"
        composerPrefill={recapPrefill || null}
      />
    </div>
  );
}
