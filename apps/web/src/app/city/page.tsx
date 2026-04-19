import { prisma } from "@/lib/prisma";
import DistrictBadge from "@/components/DistrictBadge";
import AiScoreBar from "@/components/AiScoreBar";
import { DISTRICT_META } from "@/lib/scoring";

export const dynamic = "force-dynamic";

export default async function CityPage() {
  const [topPrime, topLabel, topIndie] = await Promise.all([
    prisma.song.findMany({
      where: { isActive: true, district: "DOWNTOWN_PRIME" },
      orderBy: { aiScore: "desc" },
      take: 6,
      select: { id: true, title: true, artist: true, coverUrl: true, aiScore: true, soldLicenses: true },
    }),
    prisma.song.findMany({
      where: { isActive: true, district: "LABEL_ROW" },
      orderBy: { aiScore: "desc" },
      take: 6,
      select: { id: true, title: true, artist: true, coverUrl: true, aiScore: true, soldLicenses: true },
    }),
    prisma.song.findMany({
      where: { isActive: true, district: "INDIE_BLOCKS" },
      orderBy: { aiScore: "desc" },
      take: 9,
      select: { id: true, title: true, artist: true, coverUrl: true, aiScore: true, soldLicenses: true },
    }),
  ]);

  function MiniSongCard({
    song,
  }: {
    song: {
      id: string;
      title: string;
      artist: string;
      coverUrl?: string | null;
      aiScore: number;
      soldLicenses: number;
    };
  }) {
    return (
      <a
        href={`/studio/${song.id}`}
        className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 transition hover:border-brand-500/50 hover:bg-white/10"
      >
        <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-brand-900 to-accent-600 flex items-center justify-center text-xl">
          {song.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={song.coverUrl} alt={song.title} className="h-full w-full object-cover" />
          ) : (
            "🎵"
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium line-clamp-1 text-sm">{song.title}</p>
          <p className="text-xs text-white/50 line-clamp-1">{song.artist}</p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-xs font-bold text-brand-400">{song.aiScore.toFixed(1)}</p>
          <p className="text-xs text-white/30">{song.soldLicenses} sold</p>
        </div>
      </a>
    );
  }

  function District({
    district,
    songs,
  }: {
    district: "LABEL_ROW" | "DOWNTOWN_PRIME" | "INDIE_BLOCKS";
    songs: Parameters<typeof MiniSongCard>[0]["song"][];
  }) {
    const meta = DISTRICT_META[district];
    return (
      <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-6">
        <div className="mb-4 flex items-center gap-3">
          <DistrictBadge district={district} />
          <span className="text-sm text-white/40">{meta.description}</span>
          <span className="ml-auto text-xs text-white/30">
            {meta.visibilityMultiplier}× visibility
          </span>
        </div>
        {songs.length === 0 ? (
          <p className="text-center text-sm text-white/30 py-6">
            No songs in this district yet.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {songs.map((s) => (
              <MiniSongCard key={s.id} song={s} />
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-10">
        <h1 className="text-4xl font-extrabold">🏙️ The City</h1>
        <p className="mt-2 text-white/50">
          Songs are ranked into districts based on their EMS Score. Higher districts
          get more discovery exposure on the platform.
        </p>
      </div>

      {/* How districts work */}
      <div className="mb-10 grid gap-4 md:grid-cols-3">
        {(["LABEL_ROW", "DOWNTOWN_PRIME", "INDIE_BLOCKS"] as const).map((d) => {
          const meta = DISTRICT_META[d];
          return (
            <div key={d} className={`rounded-2xl border border-white/10 ${meta.bg} p-4 text-center`}>
              <p className={`text-lg font-bold ${meta.color}`}>{meta.label}</p>
              <p className="mt-1 text-xs text-white/50">{meta.description}</p>
              <p className="mt-2 text-xl font-black">{meta.visibilityMultiplier}×</p>
              <p className="text-xs text-white/30">discovery boost</p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-8">
        <District district="LABEL_ROW" songs={topLabel} />
        <District district="DOWNTOWN_PRIME" songs={topPrime} />
        <District district="INDIE_BLOCKS" songs={topIndie} />
      </div>

      <p className="mt-8 text-center text-xs text-white/25">
        Districts reflect algorithmic popularity metrics only. District placement
        is not a financial endorsement and does not guarantee any revenue.
      </p>
    </div>
  );
}
