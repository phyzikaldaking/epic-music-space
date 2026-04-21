import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/analytics");
  }

  const userId = session.user.id;

  // Fetch artist songs with key metrics
  const songs = await prisma.song.findMany({
    where: { artistId: userId, isActive: true },
    select: {
      id: true,
      title: true,
      artist: true,
      genre: true,
      coverUrl: true,
      aiScore: true,
      boostScore: true,
      streamCount: true,
      soldLicenses: true,
      totalLicenses: true,
      licensePrice: true,
      revenueSharePct: true,
      district: true,
      createdAt: true,
      versusWins: true,
      versusLosses: true,
    },
    orderBy: { aiScore: "desc" },
  });

  // Fetch recent successful transactions (purchases of this artist's songs)
  const transactions = await prisma.transaction.findMany({
    where: {
      song: { artistId: userId },
      status: "SUCCEEDED",
      type: "LICENSE_PURCHASE",
    },
    select: {
      id: true,
      amount: true,
      createdAt: true,
      song: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  // Compute summary stats
  const totalSongs = songs.length;
  const totalStreams = songs.reduce((s, x) => s + x.streamCount, 0);
  const totalLicensesSold = songs.reduce((s, x) => s + x.soldLicenses, 0);
  const totalRevenue = transactions.reduce((s, t) => s + Number(t.amount), 0);
  const avgAiScore =
    songs.length > 0 ? songs.reduce((s, x) => s + x.aiScore, 0) / songs.length : 0;

  // Group transactions by day (last 14 days)
  const now = new Date();
  const dayLabels: string[] = [];
  const dayCounts: number[] = [];
  const dayRevenue: number[] = [];

  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    dayLabels.push(label);

    const dayTxs = transactions.filter((t) => {
      const td = new Date(t.createdAt);
      return (
        td.getFullYear() === d.getFullYear() &&
        td.getMonth() === d.getMonth() &&
        td.getDate() === d.getDate()
      );
    });
    dayCounts.push(dayTxs.length);
    dayRevenue.push(dayTxs.reduce((s, t) => s + Number(t.amount), 0));
  }

  const maxCount = Math.max(...dayCounts, 1);
  const maxRevenue = Math.max(...dayRevenue, 1);

  // Top song by revenue
  const songRevMap = new Map<string, number>();
  for (const t of transactions) {
    if (t.song) {
      songRevMap.set(t.song.id, (songRevMap.get(t.song.id) ?? 0) + Number(t.amount));
    }
  }
  const topSong = songs.reduce(
    (best, s) => {
      const rev = songRevMap.get(s.id) ?? 0;
      return rev > (songRevMap.get(best?.id ?? "") ?? 0) ? s : best;
    },
    songs[0] ?? null
  );

  const isArtist = songs.length > 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-gradient-ems">Analytics</h1>
          <p className="mt-1 text-sm text-white/40">
            Track your music performance and revenue in real time.
          </p>
        </div>
        {isArtist && (
          <a
            href="/boost"
            className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold hover:bg-brand-600 transition glow-purple"
          >
            ⚡ Boost a Track
          </a>
        )}
      </div>

      {!isArtist ? (
        <div className="glass-card rounded-2xl p-10 text-center">
          <p className="text-4xl mb-4">🎵</p>
          <h2 className="text-xl font-bold mb-2">No tracks yet</h2>
          <p className="text-white/40 mb-6 text-sm">
            Upload your first song to start seeing analytics.
          </p>
          <a
            href="/studio/new"
            className="inline-block rounded-xl bg-brand-500 px-6 py-3 font-semibold hover:bg-brand-600 transition"
          >
            Upload Track
          </a>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-10">
            {[
              { label: "Songs", value: totalSongs, icon: "🎵", color: "text-white" },
              { label: "Total Streams", value: totalStreams.toLocaleString(), icon: "▶️", color: "text-accent-400" },
              { label: "Licenses Sold", value: totalLicensesSold, icon: "🪙", color: "text-brand-400" },
              { label: "Revenue", value: `$${totalRevenue.toLocaleString("en-US", { maximumFractionDigits: 2 })}`, icon: "💰", color: "text-gold" },
              { label: "Avg EMS Score", value: avgAiScore.toFixed(1), icon: "📊", color: "text-brand-400" },
            ].map((stat) => (
              <div key={stat.label} className="glass-card rounded-2xl p-5 text-center">
                <div className="text-2xl mb-2">{stat.icon}</div>
                <p className="text-xs text-white/40">{stat.label}</p>
                <p className={`text-xl font-extrabold mt-1 ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Charts grid */}
          <div className="grid gap-6 lg:grid-cols-2 mb-10">
            {/* Purchases chart */}
            <div className="glass-card rounded-2xl p-6">
              <h2 className="text-sm font-semibold text-white/60 mb-5">
                License Sales — Last 14 Days
              </h2>
              <div className="flex items-end gap-1 h-28">
                {dayCounts.map((count, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full rounded-sm bg-brand-500/70 transition-all"
                      style={{ height: `${Math.max(4, (count / maxCount) * 100)}%` }}
                      title={`${count} sales`}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-2 text-xs text-white/20">
                <span>{dayLabels[0]}</span>
                <span>{dayLabels[dayLabels.length - 1]}</span>
              </div>
            </div>

            {/* Revenue chart */}
            <div className="glass-card rounded-2xl p-6">
              <h2 className="text-sm font-semibold text-white/60 mb-5">
                Revenue — Last 14 Days
              </h2>
              <div className="flex items-end gap-1 h-28">
                {dayRevenue.map((rev, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full rounded-sm bg-gold/70 transition-all"
                      style={{ height: `${Math.max(4, (rev / maxRevenue) * 100)}%` }}
                      title={`$${rev.toFixed(2)}`}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-2 text-xs text-white/20">
                <span>{dayLabels[0]}</span>
                <span>{dayLabels[dayLabels.length - 1]}</span>
              </div>
            </div>
          </div>

          {/* Song performance table */}
          <div className="glass-card rounded-2xl p-6 mb-10">
            <h2 className="text-sm font-semibold text-white/60 mb-5">Song Performance</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-white/30 border-b border-white/10">
                    <th className="text-left pb-3">Track</th>
                    <th className="text-right pb-3">Streams</th>
                    <th className="text-right pb-3">Licenses</th>
                    <th className="text-right pb-3">Revenue</th>
                    <th className="text-right pb-3">EMS Score</th>
                    <th className="text-right pb-3">Boost</th>
                    <th className="text-right pb-3">District</th>
                  </tr>
                </thead>
                <tbody>
                  {songs.map((song) => {
                    const rev = (songRevMap.get(song.id) ?? 0);
                    return (
                      <tr
                        key={song.id}
                        className="border-b border-white/5 hover:bg-white/5 transition"
                      >
                        <td className="py-3">
                          <a
                            href={`/track/${song.id}`}
                            className="font-medium hover:text-brand-400 transition truncate max-w-[200px] block"
                          >
                            {song.title}
                          </a>
                          {song.genre && (
                            <span className="text-xs text-white/30">{song.genre}</span>
                          )}
                        </td>
                        <td className="py-3 text-right text-white/60">
                          {song.streamCount.toLocaleString()}
                        </td>
                        <td className="py-3 text-right">
                          <span className="text-brand-400 font-semibold">{song.soldLicenses}</span>
                          <span className="text-white/30">/{song.totalLicenses}</span>
                        </td>
                        <td className="py-3 text-right text-gold font-semibold">
                          ${rev.toFixed(2)}
                        </td>
                        <td className="py-3 text-right text-accent-400 font-semibold">
                          {song.aiScore.toFixed(1)}
                        </td>
                        <td className="py-3 text-right text-brand-400">
                          {song.boostScore.toFixed(0)}
                        </td>
                        <td className="py-3 text-right">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            song.district === "LABEL_ROW"
                              ? "bg-accent-500/20 text-accent-400"
                              : song.district === "DOWNTOWN_PRIME"
                              ? "bg-brand-500/20 text-brand-400"
                              : "bg-white/10 text-white/40"
                          }`}>
                            {song.district === "LABEL_ROW" ? "Label Row" :
                             song.district === "DOWNTOWN_PRIME" ? "Downtown" : "Indie"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Potential reach CTA */}
          <div className="glass-purple rounded-2xl p-8 border border-brand-500/30 relative overflow-hidden">
            <div className="absolute inset-0 opacity-5 bg-gradient-to-br from-brand-500 to-accent-500" />
            <div className="relative">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                  <h2 className="text-xl font-extrabold">Unlock Growth Tools</h2>
                  <p className="mt-2 text-white/50 max-w-md text-sm">
                    Upgrade to Pro or Prime to access advanced analytics, audience demographics,
                    predicted revenue modeling, and AI-powered track optimization.
                  </p>
                  {topSong && (
                    <p className="mt-3 text-xs text-white/30">
                      🔒 Potential reach for <span className="text-brand-400">{topSong.title}</span>:{" "}
                      <span className="text-white/50">estimated {(topSong.aiScore * 500).toLocaleString()} monthly listeners</span>
                    </p>
                  )}
                </div>
                <a
                  href="/pricing"
                  className="flex-shrink-0 rounded-xl bg-gradient-to-r from-brand-500 to-accent-500 px-6 py-3 font-bold hover:opacity-90 transition glow-purple"
                >
                  Upgrade to Pro →
                </a>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
