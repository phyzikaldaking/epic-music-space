import { prisma } from "@/lib/prisma";
import LeaderboardTable from "@/components/LeaderboardTable";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const sp = await searchParams;
  const type = sp.type === "artists" ? "artists" : "songs";

  const songs = type === "songs"
    ? await prisma.song.findMany({
        where: { isActive: true },
        orderBy: [{ aiScore: "desc" }, { soldLicenses: "desc" }],
        take: 50,
        select: {
          id: true,
          title: true,
          artist: true,
          genre: true,
          coverUrl: true,
          aiScore: true,
          soldLicenses: true,
          district: true,
        },
      })
    : [];

  const artists =
    type === "artists"
      ? await prisma.user.findMany({
          where: { role: { in: ["ARTIST", "LABEL"] } },
          select: {
            id: true,
            name: true,
            image: true,
            studio: { select: { username: true, district: true } },
            songs: {
              where: { isActive: true },
              select: { soldLicenses: true, aiScore: true },
            },
            _count: { select: { followers: true } },
          },
        })
      : [];

  const artistRows = artists
    .map((a) => ({
      id: a.id,
      name: a.name,
      image: a.image,
      username: a.studio?.username,
      district: a.studio?.district,
      totalLicensesSold: a.songs.reduce((s, x) => s + x.soldLicenses, 0),
      avgAiScore:
        a.songs.length > 0
          ? a.songs.reduce((s, x) => s + x.aiScore, 0) / a.songs.length
          : 0,
      followers: a._count.followers,
    }))
    .sort((a, b) => b.totalLicensesSold - a.totalLicensesSold)
    .slice(0, 50);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-8">
        <h1 className="text-4xl font-extrabold">🏆 Leaderboard</h1>
        <p className="mt-2 text-white/50">
          Top songs and artists ranked by EMS Score and licensing activity.
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-3">
        <a
          href="/leaderboard?type=songs"
          className={`rounded-xl px-5 py-2 text-sm font-semibold transition ${
            type === "songs"
              ? "bg-brand-500 text-white"
              : "border border-white/20 text-white/60 hover:bg-white/10"
          }`}
        >
          🎵 Songs
        </a>
        <a
          href="/leaderboard?type=artists"
          className={`rounded-xl px-5 py-2 text-sm font-semibold transition ${
            type === "artists"
              ? "bg-brand-500 text-white"
              : "border border-white/20 text-white/60 hover:bg-white/10"
          }`}
        >
          🎤 Artists
        </a>
      </div>

      <LeaderboardTable
        entries={type === "songs" ? songs : artistRows}
        type={type}
      />
    </div>
  );
}
