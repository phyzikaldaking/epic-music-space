import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import SongCard from "@/components/SongCard";

export const metadata: Metadata = {
  title: "Trending — Epic Music Space",
  description:
    "What artists, fans, and licensees are reaching for right now. Live ranking based on plays, sales, follows, and AI score.",
};

export const revalidate = 300; // refresh every 5 min

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface TrendingSong {
  id: string;
  title: string;
  artist: string;
  genre: string | null;
  coverUrl: string | null;
  audioUrl: string;
  licensePrice: number;
  revenueSharePct: number;
  soldLicenses: number;
  totalLicenses: number;
  bpm: number | null;
  key: string | null;
  aiScore: number;
  boostScore: number;
  recentPlays: number;
  recentSales: number;
}

async function getTrending(): Promise<TrendingSong[]> {
  const since = new Date(Date.now() - SEVEN_DAYS_MS);

  // Fetch top candidates by AI score, then enrich with 7-day plays + sales.
  const candidates = await prisma.song.findMany({
    where: { isActive: true },
    orderBy: [{ aiScore: "desc" }, { soldLicenses: "desc" }],
    take: 60,
    select: {
      id: true,
      title: true,
      artist: true,
      genre: true,
      coverUrl: true,
      audioUrl: true,
      licensePrice: true,
      revenueSharePct: true,
      soldLicenses: true,
      totalLicenses: true,
      bpm: true,
      key: true,
      aiScore: true,
      boostScore: true,
    },
  });
  if (candidates.length === 0) return [];

  const ids = candidates.map((c) => c.id);
  const [plays, sales] = await Promise.all([
    prisma.userBehaviorEvent.groupBy({
      by: ["songId"],
      where: { songId: { in: ids }, eventType: "view", createdAt: { gte: since } },
      _count: { _all: true },
    }).catch(() => [] as Array<{ songId: string | null; _count: { _all: number } }>),
    prisma.licenseToken.groupBy({
      by: ["songId"],
      where: { songId: { in: ids }, purchasedAt: { gte: since } },
      _count: { _all: true },
    }).catch(() => [] as Array<{ songId: string; _count: { _all: number } }>),
  ]);

  const playsBy = new Map<string, number>();
  for (const p of plays) if (p.songId) playsBy.set(p.songId, p._count._all);
  const salesBy = new Map<string, number>();
  for (const s of sales) salesBy.set(s.songId, s._count._all);

  const enriched: TrendingSong[] = candidates.map((c) => ({
    id: c.id,
    title: c.title,
    artist: c.artist,
    genre: c.genre,
    coverUrl: c.coverUrl,
    audioUrl: c.audioUrl,
    licensePrice: Number(c.licensePrice),
    revenueSharePct: Number(c.revenueSharePct),
    soldLicenses: c.soldLicenses,
    totalLicenses: c.totalLicenses,
    bpm: c.bpm,
    key: c.key,
    aiScore: c.aiScore,
    boostScore: c.boostScore,
    recentPlays: playsBy.get(c.id) ?? 0,
    recentSales: salesBy.get(c.id) ?? 0,
  }));

  // Trending score: weighted blend of 7-day momentum + AI quality + boost.
  enriched.sort((a, b) => {
    const trendA = a.recentSales * 8 + a.recentPlays * 1 + a.aiScore * 0.4 + a.boostScore * 1.5;
    const trendB = b.recentSales * 8 + b.recentPlays * 1 + b.aiScore * 0.4 + b.boostScore * 1.5;
    return trendB - trendA;
  });

  return enriched.slice(0, 24);
}

export default async function TrendingPage() {
  const trending = await getTrending();

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <header className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-accent-300">
          Last 7 days
        </p>
        <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Trending now</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/55">
          Ranked by a blend of recent plays, recent licenses, AI score, and boost
          activity. Updates every five minutes. Want to land here?{" "}
          <Link href="/studio/new" className="text-brand-300 hover:underline">
            Drop a track
          </Link>
          .
        </p>
      </header>

      {trending.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-white/3 p-10 text-center">
          <p className="text-sm text-white/45">
            Trending will fill in as artists upload and listeners discover. Check{" "}
            <Link href="/marketplace" className="text-brand-300 hover:underline">
              the marketplace
            </Link>{" "}
            for the full catalog.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {trending.map((s, i) => (
            <SongCard
              key={s.id}
              id={s.id}
              title={s.title}
              artist={s.artist}
              genre={s.genre}
              coverUrl={s.coverUrl}
              audioUrl={s.audioUrl}
              licensePrice={s.licensePrice}
              revenueSharePct={s.revenueSharePct}
              soldLicenses={s.soldLicenses}
              totalLicenses={s.totalLicenses}
              bpm={s.bpm}
              musicalKey={s.key}
              aiScore={s.aiScore}
              boostScore={s.boostScore}
              isTrending
              rankPosition={i + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
