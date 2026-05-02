import { prisma } from "@/lib/prisma";
import SongCard from "@/components/SongCard";
import MarketplaceFilters from "@/components/MarketplaceFilters";
import MarketplaceWorld3D from "@/components/MarketplaceWorld3D";
import MarketplacePresence from "@/components/MarketplacePresence";
import MarketplaceConfidencePanel from "@/components/MarketplaceConfidencePanel";
import MarketplaceRetentionTools from "@/components/MarketplaceRetentionTools";
import { Suspense } from "react";
import type { Metadata } from "next";
import type { Song } from "@ems/db";
import { demoTracks } from "@/lib/demoTracks";

export const revalidate = 30;

export const metadata: Metadata = {
  title: "Marketplace | Epic Music Space",
  description:
    "A premium music licensing exchange for ranked tracks, studio drops, and creator-ready music.",
};

type MarketplaceSong = Song & { boostScore?: number; rankScore?: number };

const categories = ["All", "Beats", "Hooks", "Sync", "Trap", "R&B", "Pop", "Drill", "Afrobeats", "Cinematic"];

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

export default async function MarketplacePage() {
  let allSongs: MarketplaceSong[] = [];

  try {
    allSongs = await prisma.song.findMany({ where: { isActive: true } });
  } catch {
    allSongs = demoTracks as unknown as MarketplaceSong[];
  }

  const rankedSongs = allSongs
    .map((song) => ({ ...song, rankScore: Number(song.aiScore ?? 0) + Number(song.boostScore ?? 0) }))
    .sort((a, b) => Number(b.rankScore ?? 0) - Number(a.rankScore ?? 0));

  const topSong = rankedSongs[0];
  const dominanceStrip = rankedSongs.slice(0, 5);
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
              <h1 className="mt-4 max-w-4xl text-5xl font-black leading-[0.92] tracking-[-0.07em] text-white md:text-7xl">The premium exchange floor for music licensing.</h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-white/66 md:text-lg">Discover ranked tracks, studio drops, and creator-ready music with clear licensing terms, supply visibility, and marketplace momentum built into every release.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#marketplace-catalog" className="inline-flex min-h-12 items-center justify-center rounded-full bg-white px-6 text-sm font-black uppercase tracking-[0.12em] text-black shadow-2xl shadow-white/10 transition hover:-translate-y-0.5 hover:bg-cyan-200">Explore Catalog</a>
                <a href="/auth/signup" className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/15 bg-white/[0.05] px-6 text-sm font-black uppercase tracking-[0.12em] text-white backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-gold-200/40 hover:bg-gold-200/10">Sell Your Music</a>
              </div>
            </div>
            <div className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5 shadow-2xl shadow-black/40 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
                <div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/38">Crown Track</p><h2 className="mt-2 line-clamp-1 text-2xl font-black tracking-[-0.04em] text-white">{topSong?.title ?? "Catalog Loading"}</h2><p className="mt-1 line-clamp-1 text-sm text-white/50">{topSong?.artist ?? "Epic Music Space"}</p></div>
                <div className="grid h-16 w-16 place-items-center rounded-2xl border border-gold-200/25 bg-gold-200/10 text-xs font-black uppercase tracking-[0.12em] text-gold-100 shadow-lg shadow-gold-500/10">Crown</div>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Tracks</p><p className="mt-2 text-2xl font-black text-white">{formatCompactNumber(rankedSongs.length)}</p></div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Claimed</p><p className="mt-2 text-2xl font-black text-white">{formatCompactNumber(claimedLicenses)}</p></div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Boosted</p><p className="mt-2 text-2xl font-black text-white">{formatCompactNumber(boostedCount)}</p></div>
              </div>
              <div className="mt-4 rounded-2xl border border-cyan-200/10 bg-cyan-200/[0.045] p-4"><div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.18em] text-white/44"><span>License Supply</span><span>{formatCompactNumber(totalSupply)}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-white to-gold-200" style={{ width: `${Math.min(100, totalSupply > 0 ? (claimedLicenses / totalSupply) * 100 : 0)}%` }} /></div></div>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <div className="flex gap-3 overflow-x-auto pb-2">{categories.map((category, index) => (<a key={category} href={index === 0 ? "/marketplace" : `/marketplace?genre=${encodeURIComponent(category)}`} className={`whitespace-nowrap rounded-full border px-5 py-2.5 text-sm font-black uppercase tracking-[0.12em] transition ${index === 0 ? "border-cyan-200/35 bg-cyan-200/12 text-cyan-100 shadow-lg shadow-cyan-500/10" : "border-white/10 bg-white/[0.045] text-white/52 hover:border-cyan-200/35 hover:bg-cyan-200/10 hover:text-cyan-100"}`}>{category}</a>))}</div>
        </section>

        {dominanceStrip.length > 0 && (
          <section className="mt-8 overflow-hidden rounded-[2rem] border border-gold-200/15 bg-black/35 p-5 shadow-2xl shadow-black/45 backdrop-blur-2xl">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div><p className="text-xs font-black uppercase tracking-[0.28em] text-gold-100/80">Dominance Strip</p><h2 className="mt-2 text-3xl font-black tracking-[-0.055em] text-white md:text-5xl">Top screens controlling the floor</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">These are the songs currently owning the marketplace attention layer. Boosts, sales, and EMS score decide who stays visible.</p></div>
              <div className="rounded-full border border-gold-200/20 bg-gold-200/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-gold-100">Live Rank Cycle</div>
            </div>
            <div className="grid gap-4 md:grid-cols-5">
              {dominanceStrip.map((song, index) => {
                const gap = getCompetitorGap(song, dominanceStrip[index - 1]);
                return (
                  <a key={song.id} href={`/track/${song.id}`} className={`group relative overflow-hidden rounded-[1.35rem] border p-4 transition hover:-translate-y-1 ${index === 0 ? "border-gold-300/45 bg-gold-300/10 shadow-xl shadow-gold-500/15" : "border-white/10 bg-white/[0.045] hover:border-cyan-200/35"}`}>
                    <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.16),transparent_28%,transparent_70%,rgba(34,211,238,0.08))] opacity-40" />
                    <div className="relative"><div className="flex items-center justify-between"><span className="text-3xl font-black tracking-[-0.08em] text-white/90">#{index + 1}</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${index === 0 ? "bg-gold-200/15 text-gold-100" : "bg-cyan-200/10 text-cyan-100"}`}>{index === 0 ? "Crown" : index < 3 ? "Elite" : "Threat"}</span></div><h3 className="mt-5 line-clamp-1 text-lg font-black tracking-[-0.04em] text-white">{song.title}</h3><p className="mt-1 line-clamp-1 text-sm text-white/45">{song.artist}</p><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-gold-300 via-white to-cyan-300" style={{ width: `${Math.max(10, Math.min(100, Number(song.rankScore ?? 0) / 3))}%` }} /></div><div className="mt-3 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.14em] text-white/42"><span>Power</span><span>{Number(song.rankScore ?? 0).toFixed(1)}</span></div>{gap != null && gap > 0 && <p className="mt-2 text-[11px] font-semibold text-gold-100/70">{gap.toFixed(1)} power from next slot</p>}</div>
                  </a>
                );
              })}
            </div>
          </section>
        )}

        <section className="mt-8"><MarketplaceWorld3D items={rankedSongs} /></section>

        <section className="mt-8 grid gap-8 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/35 backdrop-blur-2xl"><div className="mb-5 flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-gold-100/70">Pro Filters</p><h2 className="mt-1 text-2xl font-black tracking-[-0.045em] text-white">Refine the floor</h2></div><div className="h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-lg shadow-cyan-300/60" /></div><Suspense><MarketplaceFilters totalCount={rankedSongs.length} /></Suspense></div>
            <div className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5 shadow-2xl shadow-black/35 backdrop-blur-2xl"><div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/35">Live Presence</p><p className="mt-1 text-sm text-white/55">See who is active around the catalog.</p></div><MarketplacePresence compact /></div></div>
          </aside>
          <div id="marketplace-catalog" className="space-y-8">
            <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/35 backdrop-blur-2xl"><div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.26em] text-cyan-200/75">Ranked Catalog</p><h2 className="mt-2 text-3xl font-black tracking-[-0.055em] text-white md:text-5xl">Studio monitor listings</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-white/50">Every screen represents a track competing for attention, licensing, and placement. Stronger score means stronger visibility.</p></div><div className="rounded-full border border-white/10 bg-black/30 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white/48">{rankedSongs.length} active listings</div></div></div>
            <MarketplaceConfidencePanel tracks={rankedSongs.map((song) => ({ id: song.id, title: song.title, artist: song.artist, audioUrl: song.audioUrl, aiScore: song.aiScore }))} />
            <MarketplaceRetentionTools tracks={rankedSongs.map((song) => ({ id: song.id, title: song.title }))} />
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {rankedSongs.map((song, index) => (<SongCard key={song.id} {...(song as any)} boostScore={song.boostScore} rankPosition={index + 1} competitorGap={getCompetitorGap(song, rankedSongs[index - 1])} placementLabel={index === 0 ? "Billboard Owner" : index < 3 ? "Top Placement" : Number(song.boostScore ?? 0) > 0 ? "Sponsored Push" : null} />))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
