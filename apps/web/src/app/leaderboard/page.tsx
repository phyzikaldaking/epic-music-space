import { prisma } from "@/lib/prisma";
import LeaderboardTable from "@/components/LeaderboardTable";
import LiveLeaderboard from "@/components/LiveLeaderboard";

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
      name: a.name ?? "Unknown Artist",
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

  const initialEntries = type === "songs" ? songs : artistRows;

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-8">
        <h1 className="flex items-center gap-3 text-4xl font-extrabold">
          <svg
            aria-hidden="true"
            className="h-9 w-9 text-gold-400"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M4.5 3h15a.5.5 0 0 1 .5.5V7a5 5 0 0 1-4 4.9V13a5 5 0 0 1-4.5 4.975V20h3.25a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5H10.5v-2.025A5 5 0 0 1 6 13v-1.1A5 5 0 0 1 2 7V3.5a.5.5 0 0 1 .5-.5H4.5ZM17 8.9A3.5 3.5 0 0 0 18.5 6V4.5H17V8.9ZM7 8.9V4.5H5.5V6A3.5 3.5 0 0 0 7 8.9Z" />
          </svg>
          Leaderboard
        </h1>
        <p className="mt-2 text-white/50">
          Top songs and artists ranked by EMS Score and licensing activity.
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-3">
        <a
          href="/leaderboard?type=songs"
          className={`inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold transition ${
              ? "bg-brand-500 text-white"
              : "border border-white/20 text-white/60 hover:bg-white/10"
          }`}
        >
          <svg aria-hidden="true" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 3v10.55A4 4 0 1 0 14 17V7h6V3h-8Z" />
          </svg>
          Songs
        </a>
        <a
          href="/leaderboard?type=artists"
          className={`inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold transition ${
              ? "bg-brand-500 text-white"
              : "border border-white/20 text-white/60 hover:bg-white/10"
          }`}
        >
          <svg aria-hidden="true" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12Zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8Z" />
          </svg>
          Artists
        </a>
      </div>

      <LiveLeaderboard
        initialEntries={initialEntries}
        type={type}
        LeaderboardTableComponent={LeaderboardTable}
      />
    </div>
  );
}
