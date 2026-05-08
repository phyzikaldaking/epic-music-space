import { prisma } from "@/lib/prisma";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Suspense } from "react";
import type { Metadata } from "next";
import SongCard from "@/components/SongCard";
import { getDemoTracks } from "@/lib/demoTracks";
import MarketplaceFilters from "@/components/MarketplaceFilters";
import MarketplaceSearch from "@/components/MarketplaceSearch";
import AdSlot from "@/components/ads/AdSlot";
import { computeRankingTransparency } from "@/lib/rankingTransparency";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import MadeForYouRail from "@/components/MadeForYouRail";
import type { RailCandidate } from "@/lib/personalizedRail";

export const revalidate = 30;

export const metadata: Metadata = {
  title: "Marketplace",
  description:
    "Discover trending tracks, follow rising artists, and support music directly from the community in real time.",
};

type PriceLike = string | number | { toString(): string };
type RawTrack = {
  id: string;
  title: string;
  artist: string;
  genre: string | null;
  audioUrl: string;
  coverUrl: string | null;
  bpm: number | null;
  key: string | null;
  licensePrice: PriceLike;
  revenueSharePct: PriceLike;
  totalLicenses: number;
  soldLicenses: number;
  aiScore: number;
  boostScore?: number | null;
  streamCount?: number | null;
  versusWins?: number | null;
  versusLosses?: number | null;
  createdAt?: Date | null;
};
type MarketplaceSong = {
  id: string;
  title: string;
  artist: string;
  genre: string | null;
  audioUrl: string;
  coverUrl: string | null;
  bpm: number | null;
  key: string | null;
  licensePrice: number;
  revenueSharePct: number;
  totalLicenses: number;
  soldLicenses: number;
  aiScore: number;
  boostScore: number;
  paidBoostApplied: number;
  paidBoostCap: number;
  paidBoostCapped: boolean;
  paidInfluencePct: number;
  rankingFactors: {
    aiQuality: number;
    licenseDemand: number;
    streamVelocity: number;
    versusStrength: number;
    recency: number;
  };
  rankScore: number;
};
type SearchParamValue = string | string[] | undefined;
type MarketplaceSearchParams = Record<string, SearchParamValue>;

const RESILIENT_FALLBACK_TRACKS: RawTrack[] = [
  {
    id: "fallback-crown-room",
    title: "Crown Room",
    artist: "EMS Sessions",
    genre: "Cinematic",
    audioUrl: "/demo/audio/back-then-drunk.wav",
    coverUrl: null,
    bpm: 92,
    key: "F minor",
    licensePrice: 79,
    revenueSharePct: 8.5,
    totalLicenses: 100,
    soldLicenses: 21,
    aiScore: 92,
    boostScore: 0,
    streamCount: 2400,
    versusWins: 4,
    versusLosses: 1,
    createdAt: new Date(),
  },
  {
    id: "fallback-night-grid",
    title: "Night Grid",
    artist: "EMS Sessions",
    genre: "Trap",
    audioUrl: "/demo/audio/dog-food.wav",
    coverUrl: null,
    bpm: 140,
    key: "E minor",
    licensePrice: 69,
    revenueSharePct: 7.9,
    totalLicenses: 90,
    soldLicenses: 18,
    aiScore: 89,
    boostScore: 0,
    streamCount: 1800,
    versusWins: 3,
    versusLosses: 2,
    createdAt: new Date(),
  },
  {
    id: "fallback-after-hours",
    title: "After Hours Signal",
    artist: "EMS Sessions",
    genre: "R&B",
    audioUrl: "/demo/audio/pay-like-you-weigh.wav",
    coverUrl: null,
    bpm: 104,
    key: "C minor",
    licensePrice: 74,
    revenueSharePct: 8.1,
    totalLicenses: 80,
    soldLicenses: 13,
    aiScore: 87,
    boostScore: 0,
    streamCount: 1300,
    versusWins: 2,
    versusLosses: 2,
    createdAt: new Date(),
  },
];

const MarketplaceWorld3D = dynamic(() => import("@/components/MarketplaceWorld3D"), {
  loading: () => <SectionShell title="Marketplace World" description="Loading live district pulse..." />,
});

const MarketplacePresence = dynamic(() => import("@/components/MarketplacePresence"), {
  loading: () => <CompactBadge>presence standby</CompactBadge>,
});

const MarketplaceConfidencePanel = dynamic(
  () => import("@/components/MarketplaceConfidencePanel"),
  {
    loading: () => (
      <SectionShell
        title="Waveform Compare"
        description="Loading instant A/B tools and rights summary..."
      />
    ),
  },
);

const MarketplaceRetentionTools = dynamic(
  () => import("@/components/MarketplaceRetentionTools"),
  {
    loading: () => (
      <SectionShell
        title="Saved Searches"
        description="Loading watchlist and return-behavior tools..."
      />
    ),
  },
);

const categories = ["All", "Beats", "Hooks", "Sync", "Trap", "R&B", "Pop", "Drill", "Afrobeats", "Cinematic"];

function SectionShell({ title, description }: { title: string; description: string }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="h-3 w-28 rounded-full bg-white/10" />
      <h3 className="mt-4 text-xl font-bold text-white">{title}</h3>
      <p className="mt-2 text-sm text-white/55">{description}</p>
    </section>
  );
}

function CompactBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-accent-300/20 bg-accent-300/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-accent-100/80">
      {children}
    </span>
  );
}

function formatCompactNumber(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function getTotalLicenseSupply(songs: MarketplaceSong[]) {
  return songs.reduce((total, song) => total + Number(song.totalLicenses ?? 0), 0);
}

function getClaimedLicenses(songs: MarketplaceSong[]) {
  return songs.reduce((total, song) => total + Number(song.soldLicenses ?? 0), 0);
}

function getCompetitorGap(song: MarketplaceSong, previous?: MarketplaceSong) {
  if (!previous) return null;
  return Math.max(0, Number(previous.rankScore ?? 0) - Number(song.rankScore ?? 0));
}

function firstSearchParam(value: SearchParamValue): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
}

function normalizedText(value: string | null | undefined): string {
  return typeof value === "string" ? value : "";
}

function toNumber(value: PriceLike | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value.toString === "function") {
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toMarketplaceSong(track: RawTrack): MarketplaceSong {
  const aiScore = toNumber(track.aiScore);
  const boostScore = toNumber(track.boostScore ?? 0);
  const ranking = computeRankingTransparency({
    aiScore,
    boostScore,
    soldLicenses: Number(track.soldLicenses ?? 0),
    totalLicenses: Number(track.totalLicenses ?? 0),
    streamCount: Number(track.streamCount ?? 0),
    versusWins: Number(track.versusWins ?? 0),
    versusLosses: Number(track.versusLosses ?? 0),
    createdAt: track.createdAt ? new Date(track.createdAt) : new Date(),
  });
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    genre: track.genre,
    audioUrl: track.audioUrl,
    coverUrl: track.coverUrl,
    bpm: track.bpm,
    key: track.key,
    licensePrice: toNumber(track.licensePrice),
    revenueSharePct: toNumber(track.revenueSharePct),
    totalLicenses: Number(track.totalLicenses ?? 0),
    soldLicenses: Number(track.soldLicenses ?? 0),
    aiScore,
    boostScore,
    paidBoostApplied: ranking.paidApplied,
    paidBoostCap: ranking.paidCap,
    paidBoostCapped: ranking.paidBoostCapped,
    paidInfluencePct: ranking.paidInfluencePct,
    rankingFactors: ranking.factors,
    rankScore: ranking.finalScore,
  };
}

async function getResilientFallbackTracks() {
  try {
    const demoTracks = await getDemoTracks();
    if (demoTracks.length > 0) return demoTracks;
  } catch {
    // Keep rendering with static tracks if demo source is unavailable.
  }
  return RESILIENT_FALLBACK_TRACKS;
}

export default async function MarketplacePage(props: {
  searchParams: Promise<MarketplaceSearchParams>;
}) {
  const searchParams = await props.searchParams;
  const rawQuery = firstSearchParam(searchParams.q) || firstSearchParam(searchParams.search);
  const searchQuery = rawQuery.toLowerCase().trim();
  const genreFilter = firstSearchParam(searchParams.genre).toLowerCase().trim();
  // Producer-role filter: when set, restrict the marketplace to tracks
  // uploaded by users with the matching role. Lets buyers find "tracks
  // from producers" without wading through artist uploads.
  const roleFilterRaw = firstSearchParam(searchParams.role).toUpperCase().trim();
  const roleFilter = (
    ["PRODUCER", "ENGINEER", "ARTIST", "LABEL"].includes(roleFilterRaw)
      ? roleFilterRaw
      : ""
  ) as "PRODUCER" | "ENGINEER" | "ARTIST" | "LABEL" | "";

  let allSongs: RawTrack[] = [];

  try {
    allSongs = await prisma.song.findMany({
      where: {
        isActive: true,
        isDraft: false,
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
        ...(roleFilter
          ? { artist_: { role: roleFilter } }
          : {}),
      },
      select: {
        id: true,
        title: true,
        artist: true,
        genre: true,
        audioUrl: true,
        coverUrl: true,
        bpm: true,
        key: true,
        licensePrice: true,
        revenueSharePct: true,
        totalLicenses: true,
        soldLicenses: true,
        aiScore: true,
        boostScore: true,
        streamCount: true,
        versusWins: true,
        versusLosses: true,
        createdAt: true,
      },
    });
  } catch {
    allSongs = await getResilientFallbackTracks();
  }

  if (allSongs.length === 0) {
    allSongs = await getResilientFallbackTracks();
  }

  const rankedSongs = allSongs
    .map((song) => {
      try {
        return toMarketplaceSong(song);
      } catch {
        return null;
      }
    })
    .filter((song): song is MarketplaceSong => Boolean(song))
    .sort((a, b) => Number(b.rankScore ?? 0) - Number(a.rankScore ?? 0));

  const displaySongs = rankedSongs.filter((song) => {
    const title = normalizedText(song.title).toLowerCase();
    const artist = normalizedText(song.artist).toLowerCase();
    const genre = normalizedText(song.genre).toLowerCase();

    const matchesQuery =
      searchQuery.length === 0 ||
      title.includes(searchQuery) ||
      artist.includes(searchQuery) ||
      genre.includes(searchQuery);
    const matchesGenre = genreFilter.length === 0 || genre === genreFilter;

    return matchesQuery && matchesGenre;
  });

  const topSong = rankedSongs[0];
  const dominanceStrip = rankedSongs.slice(0, 5);

  // Build the rail candidate set. The personalization library needs a
  // few extra fields (versusWins/Losses, createdAt) that don't live on
  // MarketplaceSong, so look them up by id from the raw track list.
  const rawById = new Map(allSongs.map((track) => [track.id, track]));
  const railCandidates: RailCandidate[] = rankedSongs.map((song) => {
    const raw = rawById.get(song.id);
    return {
      id: song.id,
      title: song.title,
      artist: song.artist,
      genre: song.genre,
      coverUrl: song.coverUrl,
      bpm: song.bpm,
      key: song.key,
      aiScore: song.aiScore,
      rankScore: song.rankScore,
      versusWins: Number(raw?.versusWins ?? 0),
      versusLosses: Number(raw?.versusLosses ?? 0),
      createdAt: raw?.createdAt ? new Date(raw.createdAt) : null,
      licensePrice: song.licensePrice,
      revenueSharePct: song.revenueSharePct,
      soldLicenses: song.soldLicenses,
      totalLicenses: song.totalLicenses,
    };
  });
  const boostedCount = rankedSongs.filter((song) => Number(song.boostScore ?? 0) > 0).length;
  const totalSupply = getTotalLicenseSupply(rankedSongs);
  const claimedLicenses = getClaimedLicenses(rankedSongs);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050507] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(34,211,238,0.16),transparent_34%),radial-gradient(circle_at_82%_8%,rgba(253,224,71,0.12),transparent_30%),linear-gradient(180deg,#050507_0%,#08080d_46%,#050507_100%)]" />
      <div className="pointer-events-none fixed inset-0 opacity-[0.18] [background-image:linear-gradient(to_right,rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,.06)_1px,transparent_1px)] [background-size:72px_72px]" />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-48 bg-gradient-to-b from-white/[0.06] to-transparent" />

      <div className="relative mx-auto max-w-7xl px-4 py-10 md:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-[2.25rem] border border-white/10 bg-white/[0.045] p-6 shadow-2xl shadow-black/60 backdrop-blur-2xl md:p-9">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_15%,rgba(34,211,238,0.26),transparent_34%),radial-gradient(circle_at_88%_10%,rgba(253,224,71,0.20),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.10),rgba(255,255,255,0.025))]" />
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-300/10 blur-3xl" />
          <div className="absolute -bottom-28 left-1/3 h-80 w-80 rounded-full bg-gold-300/10 blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.34em] text-cyan-200/85">Creator Marketplace</p>
              <h1 className="mt-4 max-w-4xl break-words text-3xl font-black leading-[0.96] tracking-[-0.05em] text-white sm:text-4xl md:text-6xl lg:text-7xl">The premium exchange floor for music licensing.</h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-white/66 md:text-lg">Discover ranked tracks, studio drops, and creator-ready music with clear licensing terms, supply visibility, and marketplace momentum built into every release.</p>
              <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-cyan-200/25 bg-cyan-200/8 px-3.5 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-cyan-100">
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Open ranking — every factor &amp; paid-boost cap on every track
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#marketplace-catalog" className="inline-flex min-h-12 items-center justify-center rounded-full bg-white px-6 text-sm font-black uppercase tracking-[0.12em] text-black shadow-2xl shadow-white/10 transition hover:-translate-y-0.5 hover:bg-cyan-200">Explore Catalog</a>
                <Link href="/auth/signup" className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/15 bg-white/[0.05] px-6 text-sm font-black uppercase tracking-[0.12em] text-white backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-gold-200/40 hover:bg-gold-200/10">Sell Your Music</Link>
              </div>
            </div>
            <div className="studio-faceplate p-5">
              <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
                <div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/38">Crown Track</p><h2 className="mt-2 line-clamp-1 text-2xl font-black tracking-[-0.04em] text-white">{topSong?.title ?? "Catalog Loading"}</h2><p className="mt-1 line-clamp-1 text-sm text-white/50">{topSong?.artist ?? "Epic Music Space"}</p></div>
                <div className="grid h-16 w-16 place-items-center rounded-2xl border border-gold-200/25 bg-gold-200/10 text-xs font-black uppercase tracking-[0.12em] text-gold-100 shadow-lg shadow-gold-500/10">Crown</div>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Tracks</p><p className="mt-2 text-2xl font-black text-white">{formatCompactNumber(rankedSongs.length)}</p></div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Claimed</p><p className="mt-2 text-2xl font-black text-white">{formatCompactNumber(claimedLicenses)}</p></div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Boosted</p><p className="mt-2 text-2xl font-black text-white">{formatCompactNumber(boostedCount)}</p></div>
              </div>
              <div className="mt-4 rounded-2xl border border-cyan-200/10 bg-cyan-200/[0.045] p-4"><div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.18em] text-white/44"><span>License Supply</span><span>{formatCompactNumber(totalSupply)}</span></div><progress max={100} value={Math.min(100, totalSupply > 0 ? (claimedLicenses / totalSupply) * 100 : 0)} className="ems-progress ems-progress-gold mt-3 h-2 w-full" aria-label="License supply claimed" /></div>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <Suspense><AdSlot location="MARKETPLACE_BANNER" className="mb-6" /></Suspense>
        </section>

        <section className="mt-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex flex-1 gap-3 overflow-x-auto pb-2 sm:pb-0">
              {categories.map((category, index) => {
                const isAll = index === 0;
                const isActive = isAll
                  ? genreFilter.length === 0
                  : category.toLowerCase() === genreFilter;
                // Preserve the active search query when switching genres so a
                // user filtering by "trap" + searching "808" doesn't lose
                // their search term every time they tap a pill.
                const params = new URLSearchParams();
                if (!isAll) params.set("genre", category);
                if (rawQuery) params.set("q", rawQuery);
                const href = params.toString()
                  ? `/marketplace?${params.toString()}`
                  : "/marketplace";
                return (
                  <a
                    key={category}
                    href={href}
                    aria-current={isActive ? "page" : undefined}
                    className={`whitespace-nowrap rounded-full border px-5 py-2.5 text-sm font-black uppercase tracking-[0.12em] transition ${
                      isActive
                        ? "border-cyan-200/35 bg-cyan-200/12 text-cyan-100 shadow-lg shadow-cyan-500/10"
                        : "border-white/10 bg-white/[0.045] text-white/52 hover:border-cyan-200/35 hover:bg-cyan-200/10 hover:text-cyan-100"
                    }`}
                  >
                    {category}
                  </a>
                );
              })}
            </div>
            <Suspense><MarketplaceSearch initialQuery={rawQuery} /></Suspense>
          </div>
          {searchQuery && (
            <p className="mt-3 text-sm text-white/45">
              {displaySongs.length === 0
                ? `No tracks found for "${rawQuery}"`
                : `${displaySongs.length} track${displaySongs.length !== 1 ? "s" : ""} matching "${rawQuery}"`}
            </p>
          )}
        </section>

        {dominanceStrip.length > 0 && (
          <section className="mt-8 studio-faceplate overflow-hidden p-5">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div><p className="text-xs font-black uppercase tracking-[0.24em] text-gold-100/80 sm:tracking-[0.28em]">Dominance Strip</p><h2 className="mt-2 break-words text-2xl font-black tracking-[-0.04em] text-white sm:text-3xl md:text-5xl md:tracking-[-0.055em]">Top screens controlling the floor</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">These are the songs currently owning the marketplace attention layer. Boosts, sales, and EMS score decide who stays visible.</p></div>
              <div className="rounded-full border border-gold-200/20 bg-gold-200/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-gold-100">Live Rank Cycle</div>
            </div>
            <div className="grid gap-4 md:grid-cols-5">
              {dominanceStrip.map((song, index) => {
                const gap = getCompetitorGap(song, dominanceStrip[index - 1]);
                return (
                  <a key={song.id} href={`/track/${song.id}`} className={`group relative overflow-hidden rounded-[1.35rem] border p-4 transition hover:-translate-y-1 ${index === 0 ? "border-gold-300/45 bg-gold-300/10 shadow-xl shadow-gold-500/15" : "border-white/10 bg-white/[0.045] hover:border-cyan-200/35"}`}>
                    <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.16),transparent_28%,transparent_70%,rgba(34,211,238,0.08))] opacity-40" />
                    <div className="relative"><div className="flex items-center justify-between"><span className="text-3xl font-black tracking-[-0.08em] text-white/90">#{index + 1}</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${index === 0 ? "bg-gold-200/15 text-gold-100" : "bg-cyan-200/10 text-cyan-100"}`}>{index === 0 ? "Crown" : index < 3 ? "Elite" : "Threat"}</span></div><h3 className="mt-5 line-clamp-1 text-lg font-black tracking-[-0.04em] text-white">{song.title}</h3><p className="mt-1 line-clamp-1 text-sm text-white/45">{song.artist}</p><progress max={100} value={Math.max(10, Math.min(100, Number(song.rankScore ?? 0) / 3))} className="ems-progress ems-progress-gold mt-4 h-1.5 w-full" aria-label={`${song.title} marketplace power`} /><div className="mt-3 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.14em] text-white/42"><span>Power</span><span>{Number(song.rankScore ?? 0).toFixed(1)}</span></div>{gap != null && gap > 0 && <p className="mt-2 text-[11px] font-semibold text-gold-100/70">{gap.toFixed(1)} power from next slot</p>}</div>
                  </a>
                );
              })}
            </div>
          </section>
        )}

        {/* Personalized rail — slots between the dominance strip and the
           3D world so signed-in users hit a curated set before scanning
           the long catalog. The component itself handles the cold-start
           and DB-failure paths. */}
        <SectionErrorBoundary title="Made for you">
          <section className="mt-8">
            <MadeForYouRail candidates={railCandidates} />
          </section>
        </SectionErrorBoundary>

        <SectionErrorBoundary title="Marketplace World"><section className="mt-8"><MarketplaceWorld3D items={rankedSongs.map((song) => ({ id: song.id, title: song.title }))} /></section></SectionErrorBoundary>

        <section className="mt-8 grid gap-8 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
            <div className="studio-faceplate p-5"><div className="mb-5 flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-gold-100/70">Pro Filters</p><h2 className="mt-1 text-2xl font-black tracking-[-0.045em] text-white">Refine the floor</h2></div><div className="h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-lg shadow-cyan-300/60" /></div><Suspense><MarketplaceFilters totalCount={rankedSongs.length} /></Suspense></div>
            <div className="studio-faceplate p-5"><div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/35">Live Presence</p><p className="mt-1 text-sm text-white/55">See who is active around the catalog.</p></div><SectionErrorBoundary title="Live Presence"><MarketplacePresence compact /></SectionErrorBoundary></div></div>
          </aside>
          <div id="marketplace-catalog" className="space-y-8">
            <div className="studio-faceplate p-5"><div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.26em] text-cyan-200/75">Ranked Catalog</p><h2 className="mt-2 text-3xl font-black tracking-[-0.055em] text-white md:text-5xl">Studio monitor listings</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-white/50">Every screen represents a track competing for attention, licensing, and placement. Stronger score means stronger visibility.</p></div><div className="rounded-full border border-white/10 bg-black/30 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white/48">{displaySongs.length} {searchQuery ? "results" : "active listings"}</div></div></div>
            <SectionErrorBoundary title="Waveform Compare"><MarketplaceConfidencePanel tracks={displaySongs.map((song) => ({ id: song.id, title: song.title, artist: song.artist, audioUrl: song.audioUrl, aiScore: song.aiScore, soldLicenses: song.soldLicenses }))} /></SectionErrorBoundary>
            <SectionErrorBoundary title="Saved Searches"><MarketplaceRetentionTools tracks={displaySongs.map((song) => ({ id: song.id, title: song.title }))} /></SectionErrorBoundary>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {displaySongs.map((song, index) => (
                <SongCard
                  key={song.id}
                  id={song.id}
                  title={song.title}
                  artist={song.artist}
                  genre={song.genre}
                  coverUrl={song.coverUrl}
                  audioUrl={song.audioUrl}
                  licensePrice={song.licensePrice}
                  revenueSharePct={song.revenueSharePct}
                  soldLicenses={song.soldLicenses}
                  totalLicenses={song.totalLicenses}
                  bpm={song.bpm}
                  musicalKey={song.key}
                  aiScore={song.aiScore}
                  boostScore={song.boostScore}
                  paidBoostApplied={song.paidBoostApplied}
                  paidBoostCap={song.paidBoostCap}
                  paidBoostCapped={song.paidBoostCapped}
                  paidInfluencePct={song.paidInfluencePct}
                  rankingFactors={song.rankingFactors}
                  rankPosition={index + 1}
                  competitorGap={getCompetitorGap(song, rankedSongs[index - 1])}
                  placementLabel={index === 0 ? "Billboard Owner" : index < 3 ? "Top Placement" : Number(song.boostScore ?? 0) > 0 ? "Sponsored Push" : null}
                />
              ))}
            </div>
            {displaySongs.length === 0 && (
              <section className="overflow-hidden rounded-[1.75rem] border border-cyan-200/20 bg-gradient-to-br from-cyan-300/10 via-white/[0.04] to-gold-200/10 p-6 shadow-2xl shadow-black/40">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.26em] text-cyan-100/80">Tracks Standby</p>
                    <h3 className="mt-2 text-3xl font-black tracking-[-0.05em] text-white">No exact matches yet</h3>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
                      Try a different genre or search term. Your tracks wall is still live and ready.
                    </p>
                  </div>
                  <Link
                    href="/marketplace"
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-cyan-200/30 bg-cyan-200/10 px-5 text-xs font-black uppercase tracking-[0.14em] text-cyan-100 transition hover:bg-cyan-200/20"
                  >
                    Reset Filters
                  </Link>
                </div>
                <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {rankedSongs.slice(0, 3).map((song) => (
                    <Link
                      key={song.id}
                      href={`/track/${song.id}`}
                      className="rounded-2xl border border-white/12 bg-black/30 p-4 transition hover:-translate-y-0.5 hover:border-cyan-200/45"
                    >
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">Suggested</p>
                      <p className="mt-2 line-clamp-1 text-lg font-black text-white">{song.title}</p>
                      <p className="mt-1 line-clamp-1 text-sm text-white/55">{song.artist}</p>
                      <p className="mt-3 text-xs font-semibold text-cyan-100/80">${song.licensePrice.toFixed(2)} license</p>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
