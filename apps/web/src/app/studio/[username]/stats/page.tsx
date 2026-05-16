/* eslint-disable react-hooks/purity */
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `@${username} stats — Epic Music Space`,
    description: `Public performance metrics for @${username}: tracks, plays, licenses sold, follower count.`,
  };
}

export const revalidate = 600;

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

export default async function PublicArtistStatsPage({ params }: Props) {
  const { username } = await params;
  const studio = await prisma.studio.findUnique({
    where: { username },
    select: {
      level: true,
      district: true,
      bio: true,
      user: {
        select: {
          id: true,
          name: true,
          image: true,
          role: true,
          createdAt: true,
          connectChargesEnabled: true,
          connectPayoutsEnabled: true,
          _count: { select: { followers: true, songs: true } },
        },
      },
    },
  }).catch(() => null);
  if (!studio) notFound();

  const userId = studio.user.id;
  const since7 = new Date(Date.now() - SEVEN_DAYS);
  const since30 = new Date(Date.now() - THIRTY_DAYS);

  const [songs, soldAgg7d, soldAgg30d, followers7d, behaviorEvents7d] = await Promise.all([
    prisma.song.findMany({
      where: { artistId: userId, isActive: true },
      select: { id: true, title: true, soldLicenses: true, totalLicenses: true, aiScore: true, streamCount: true, createdAt: true },
      orderBy: { aiScore: "desc" },
      take: 10,
    }).catch(() => [] as Array<{
      id: string;
      title: string;
      soldLicenses: number;
      totalLicenses: number;
      aiScore: number;
      streamCount: number | null;
      createdAt: Date;
    }>),
    prisma.licenseToken.count({
      where: { song: { artistId: userId }, purchasedAt: { gte: since7 } },
    }).catch(() => 0),
    prisma.licenseToken.count({
      where: { song: { artistId: userId }, purchasedAt: { gte: since30 } },
    }).catch(() => 0),
    prisma.userFollow.count({
      where: { followingId: userId, createdAt: { gte: since7 } },
    }).catch(() => 0),
    prisma.userBehaviorEvent.count({
      where: { song: { artistId: userId }, eventType: "view", createdAt: { gte: since7 } },
    }).catch(() => 0),
  ]);

  const totalLicensesSold = songs.reduce((acc, s) => acc + s.soldLicenses, 0);
  const totalCapacity = songs.reduce((acc, s) => acc + s.totalLicenses, 0);
  const totalPlays = songs.reduce((acc, s) => acc + (s.streamCount ?? 0), 0);
  const avgScore = songs.length
    ? songs.reduce((s, x) => s + x.aiScore, 0) / songs.length
    : 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link
        href={`/studio/${username}`}
        className="mb-6 inline-block text-xs uppercase tracking-widest text-white/50 hover:text-white"
      >
        ← Back to studio
      </Link>

      <header className="mb-8 flex items-center gap-4">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center text-2xl">
          {studio.user.image ? (
            <Image src={studio.user.image} alt="" width={64} height={64} className="h-full w-full object-cover" />
          ) : (
            "🎤"
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold">
            {studio.user.name ?? username}
            {studio.user.connectChargesEnabled && studio.user.connectPayoutsEnabled && (
              <span className="ml-2 text-sky-300" title="Verified">✓</span>
            )}
          </h1>
          <p className="text-sm text-white/55">
            @{username} · Lv.{studio.level} · {studio.district.replaceAll("_", " ")}
          </p>
          <p className="mt-1 text-xs text-white/35">
            Joined {studio.user.createdAt.toLocaleDateString()}
          </p>
        </div>
      </header>

      <p className="mb-8 text-xs text-white/40">
        Public stats. Share this link with managers, labels, or sync supervisors.
      </p>

      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Tracks live" value={String(studio.user._count.songs)} />
        <Stat label="Followers" value={String(studio.user._count.followers)} sub={followers7d ? `+${followers7d} this week` : undefined} />
        <Stat label="Licenses sold" value={String(totalLicensesSold)} sub={`${totalCapacity} total capacity`} />
        <Stat label="Avg AI score" value={avgScore.toFixed(1)} sub="0–100" />
      </section>

      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Sold last 7d" value={String(soldAgg7d)} highlight />
        <Stat label="Sold last 30d" value={String(soldAgg30d)} />
        <Stat label="Plays last 7d" value={String(behaviorEvents7d)} sub={`Lifetime ${totalPlays.toLocaleString()}`} />
      </section>

      {songs.length > 0 && (
        <section className="rounded-2xl border border-white/8 bg-white/3 p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-white/55">
            Top tracks by AI score
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-xs uppercase tracking-widest text-white/40">
                <tr>
                  <th className="px-3 py-2 text-left">Track</th>
                  <th className="px-3 py-2 text-right">Score</th>
                  <th className="px-3 py-2 text-right">Sold</th>
                  <th className="px-3 py-2 text-right">Plays</th>
                </tr>
              </thead>
              <tbody>
                {songs.map((s) => (
                  <tr key={s.id} className="border-t border-white/5">
                    <td className="px-3 py-2">
                      <Link href={`/track/${s.id}`} className="hover:underline">
                        {s.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.aiScore.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {s.soldLicenses}/{s.totalLicenses}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-white/50">
                      {(s.streamCount ?? 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="mt-8 text-center text-xs text-white/30">
        Numbers refresh every 10 minutes. Source of truth: epicmusicspace.com.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        highlight ? "border-emerald-500/35 bg-emerald-500/8" : "border-white/8 bg-white/3"
      }`}
    >
      <p className="text-[10px] uppercase tracking-widest text-white/40">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-[10px] text-white/45">{sub}</p>}
    </div>
  );
}
