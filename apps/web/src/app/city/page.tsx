import { prisma } from "@/lib/prisma";
import DistrictBadge from "@/components/DistrictBadge";
import { DISTRICT_META } from "@/lib/scoring";

export const dynamic = "force-dynamic";

export default async function CityPage() {
  const [topPrime, topLabel, topIndie, studiosByDistrict] = await Promise.all([
    prisma.song.findMany({
      where: { isActive: true, district: "DOWNTOWN_PRIME" },
      orderBy: { aiScore: "desc" },
      take: 6,
      select: {
        id: true, title: true, artist: true, coverUrl: true, aiScore: true, soldLicenses: true,
        artistId: true,
        artist_: { select: { studio: { select: { username: true } } } },
      },
    }),
    prisma.song.findMany({
      where: { isActive: true, district: "LABEL_ROW" },
      orderBy: { aiScore: "desc" },
      take: 6,
      select: {
        id: true, title: true, artist: true, coverUrl: true, aiScore: true, soldLicenses: true,
        artistId: true,
        artist_: { select: { studio: { select: { username: true } } } },
      },
    }),
    prisma.song.findMany({
      where: { isActive: true, district: "INDIE_BLOCKS" },
      orderBy: { aiScore: "desc" },
      take: 9,
      select: {
        id: true, title: true, artist: true, coverUrl: true, aiScore: true, soldLicenses: true,
        artistId: true,
        artist_: { select: { studio: { select: { username: true } } } },
      },
    }),
    // Studios as "buildings" — top 12 per district
    prisma.studio.findMany({
      orderBy: { user: { songs: { _count: "desc" } } },
      take: 36,
      select: {
        username: true,
        district: true,
        level: true,
        user: {
          select: {
            name: true,
            image: true,
            songs: { where: { isActive: true }, select: { aiScore: true, soldLicenses: true } },
          },
        },
      },
    }),
  ]);

  type SongWithStudio = {
    id: string;
    title: string;
    artist: string;
    coverUrl?: string | null;
    aiScore: number;
    soldLicenses: number;
    artistId: string;
    artist_: { studio: { username: string } | null } | null;
  };

  function MiniSongCard({ song }: { song: SongWithStudio }) {
    const studioHref = song.artist_?.studio?.username
      ? `/studio/${song.artist_.studio.username}`
      : `/marketplace?q=${encodeURIComponent(song.artist)}`;

    return (
      <a
        href={studioHref}
        className="flex items-center gap-3 rounded-xl border border-white/8 bg-[#141414] p-3 transition card-hover-neon"
      >
        <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-brand-800/60 to-accent-700/40 flex items-center justify-center text-xl">
          {song.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={song.coverUrl} alt={song.title} className="h-full w-full object-cover" />
          ) : (
            "🎵"
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold line-clamp-1 text-sm">{song.title}</p>
          <p className="text-xs text-white/40 line-clamp-1">{song.artist}</p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-xs font-bold text-brand-400">{song.aiScore.toFixed(1)}</p>
          <p className="text-xs text-white/25">{song.soldLicenses} sold</p>
        </div>
      </a>
    );
  }

  type StudioBuilding = (typeof studiosByDistrict)[number];

  function StudioBuilding({ studio }: { studio: StudioBuilding }) {
    const avgScore =
      studio.user.songs.length > 0
        ? studio.user.songs.reduce((s, x) => s + x.aiScore, 0) / studio.user.songs.length
        : 0;
    const totalSold = studio.user.songs.reduce((s, x) => s + x.soldLicenses, 0);
    const height = Math.max(48, Math.min(128, 48 + avgScore));

    return (
      <a
        href={`/studio/${studio.username}`}
        className="group flex flex-col items-center gap-1 transition hover:scale-105"
        title={`${studio.user.name ?? studio.username} — Lv.${studio.level}`}
      >
        {/* Building tower */}
        <div
          className="w-10 rounded-t-sm bg-gradient-to-b from-brand-500/60 to-brand-900/80 border border-brand-500/30 flex items-end justify-center pb-1 transition group-hover:from-brand-400/80"
          style={{ height: `${height}px` }}
        >
          <span className="text-[10px] font-bold text-brand-300">Lv{studio.level}</span>
        </div>
        {/* Base */}
        <div className="h-2 w-12 rounded-sm bg-white/10" />
        {/* Label */}
        <p className="text-[9px] text-white/40 line-clamp-1 max-w-[48px] text-center">
          {studio.user.name ?? studio.username}
        </p>
        {totalSold > 0 && (
          <p className="text-[9px] text-gold-400">{totalSold}🎟</p>
        )}
      </a>
    );
  }

  const studiosByDistrictMap = {
    LABEL_ROW: studiosByDistrict.filter((s) => s.district === "LABEL_ROW").slice(0, 8),
    DOWNTOWN_PRIME: studiosByDistrict.filter((s) => s.district === "DOWNTOWN_PRIME").slice(0, 8),
    INDIE_BLOCKS: studiosByDistrict.filter((s) => s.district === "INDIE_BLOCKS").slice(0, 12),
  };

  const DISTRICT_VISUAL = {
    LABEL_ROW: {
      glow: "glow-gold",
      border: "border-gold-500/35",
      bg: "bg-gold-500/6",
      headerBg: "bg-gold-500/10",
      skyline: "from-gold-900/60 to-gold-500/10",
    },
    DOWNTOWN_PRIME: {
      glow: "glow-purple",
      border: "border-brand-500/40",
      bg: "bg-brand-500/6",
      headerBg: "bg-brand-500/10",
      skyline: "from-brand-900/60 to-brand-500/10",
    },
    INDIE_BLOCKS: {
      glow: "",
      border: "border-white/10",
      bg: "bg-white/2",
      headerBg: "bg-white/5",
      skyline: "from-white/5 to-transparent",
    },
  } as const;

  function District({
    district,
    songs,
  }: {
    district: "LABEL_ROW" | "DOWNTOWN_PRIME" | "INDIE_BLOCKS";
    songs: SongWithStudio[];
  }) {
    const meta = DISTRICT_META[district];
    const visual = DISTRICT_VISUAL[district];
    const buildings = studiosByDistrictMap[district];

    return (
      <section className={`rounded-3xl border ${visual.border} ${visual.bg} overflow-hidden`}>
        {/* District header */}
        <div className={`${visual.headerBg} border-b ${visual.border} px-6 py-4`}>
          <div className="flex items-center gap-3">
            <DistrictBadge district={district} />
            <span className="text-sm text-white/40">{meta.description}</span>
            <span className="ml-auto rounded-full bg-white/8 px-3 py-0.5 text-xs font-bold text-white/60">
              {meta.visibilityMultiplier}× visibility
            </span>
          </div>
        </div>

        {/* City skyline — studio buildings */}
        {buildings.length > 0 && (
          <div className={`border-b ${visual.border} px-6 py-4`}>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25 mb-3">
              🏙️ Studios
            </p>
            <div
              className={`flex items-end gap-3 rounded-2xl bg-gradient-to-t ${visual.skyline} px-4 py-3 overflow-x-auto`}
            >
              {buildings.map((s) => (
                <StudioBuilding key={s.username} studio={s} />
              ))}
            </div>
          </div>
        )}

        <div className="p-6">
          {songs.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-white/25">No songs in this district yet.</p>
              {district !== "INDIE_BLOCKS" && (
                <a
                  href="/pricing"
                  className="mt-3 inline-block rounded-xl border border-brand-500/40 bg-brand-500/10 px-5 py-2 text-sm font-semibold text-brand-400 hover:bg-brand-500/20 transition"
                >
                  Unlock this district →
                </a>
              )}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {songs.map((s) => (
                <MiniSongCard key={s.id} song={s} />
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <div className="relative min-h-screen">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 h-[500px] w-[900px] rounded-full bg-brand-500/10 blur-[120px]" />
      <div className="pointer-events-none fixed bottom-0 right-0 h-[400px] w-[500px] rounded-full bg-gold-500/6 blur-[100px]" />

      <div className="relative mx-auto max-w-5xl px-4 py-12">
        {/* Header */}
        <div className="mb-12">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/8 px-3 py-1 text-xs font-semibold text-brand-400">
            🏙️ Live City
          </div>
          <h1 className="text-4xl font-extrabold md:text-5xl">
            The <span className="text-gradient-ems">City</span>
          </h1>
          <p className="mt-3 text-white/45 max-w-xl">
            Songs are ranked into districts based on their EMS Score. Higher
            districts get more discovery exposure on the platform.
          </p>
        </div>

        {/* District overview cards */}
        <div className="mb-12 grid gap-4 md:grid-cols-3">
          {([
            {
              district: "LABEL_ROW" as const,
              icon: "👑",
              border: "border-gold-500/35",
              bg: "bg-gold-500/8",
              textColor: "text-gold-400",
              lock: "Label plan",
            },
            {
              district: "DOWNTOWN_PRIME" as const,
              icon: "🏙️",
              border: "border-brand-500/35",
              bg: "bg-brand-500/8",
              textColor: "text-brand-400",
              lock: "Prime plan",
            },
            {
              district: "INDIE_BLOCKS" as const,
              icon: "🔮",
              border: "border-white/12",
              bg: "bg-white/3",
              textColor: "text-white/60",
              lock: null,
            },
          ] as const).map(({ district, icon, border, bg, textColor, lock }) => {
            const meta = DISTRICT_META[district];
            return (
              <div
                key={district}
                className={`rounded-2xl border ${border} ${bg} p-5 text-center`}
              >
                <p className="mb-2 text-3xl">{icon}</p>
                <p className={`mb-1 font-extrabold ${textColor}`}>{meta.label}</p>
                <p className="mb-3 text-xs text-white/40">{meta.description}</p>
                <p className="text-2xl font-black">{meta.visibilityMultiplier}×</p>
                <p className="text-xs text-white/30">discovery boost</p>
                {lock && (
                  <a
                    href="/pricing"
                    className={`mt-3 inline-block rounded-lg border ${border} px-3 py-1 text-xs font-semibold ${textColor} hover:opacity-80 transition`}
                  >
                    Requires {lock}
                  </a>
                )}
              </div>
            );
          })}
        </div>

        {/* District song lists */}
        <div className="flex flex-col gap-8">
          <District district="LABEL_ROW" songs={topLabel} />
          <District district="DOWNTOWN_PRIME" songs={topPrime} />
          <District district="INDIE_BLOCKS" songs={topIndie} />
        </div>

        {/* Premium CTA */}
        <div className="mt-12 rounded-3xl border border-brand-500/30 bg-brand-500/8 p-8 text-center">
          <p className="mb-2 text-3xl">🚀</p>
          <h3 className="mb-2 text-xl font-extrabold">
            Claim a <span className="text-gradient-ems">premium studio spot</span>
          </h3>
          <p className="mb-6 text-sm text-white/45">
            Upgrade to Prime to unlock Downtown Prime. Hit Label Row with our Label plan.
          </p>
          <a
            href="/pricing"
            className="inline-block rounded-xl bg-brand-500 px-8 py-3 text-sm font-bold text-white hover:bg-brand-600 transition glow-purple-sm"
          >
            View pricing →
          </a>
        </div>

        <p className="mt-8 text-center text-xs text-white/20">
          Districts reflect algorithmic popularity metrics only. District placement
          is not a financial endorsement and does not guarantee any revenue.
        </p>
      </div>
    </div>
  );
}
