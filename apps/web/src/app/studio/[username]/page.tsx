import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import AiScoreBar from "@/components/AiScoreBar";
import DistrictBadge from "@/components/DistrictBadge";
import SongCard from "@/components/SongCard";
import FollowButton from "@/components/FollowButton";
import TipArtistButton from "@/components/TipArtistButton";
import { BADGE_META } from "@/lib/badges";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const studio = await prisma.studio.findUnique({
    where: { username },
    select: {
      bio: true,
      user: { select: { name: true, image: true, _count: { select: { songs: true } } } },
    },
  });
  if (!studio) return { title: "Studio Not Found" };

  const artistName = studio.user.name ?? username;
  const title = `${artistName}'s Studio — Epic Music Space`;
  const description = studio.bio
    ?? `Listen to and license music from ${artistName} on Epic Music Space. ${studio.user._count.songs} tracks available.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: studio.user.image ? [{ url: studio.user.image }] : [],
      type: "profile",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: studio.user.image ? [studio.user.image] : [],
    },
  };
}

export default async function StudioProfilePage({ params }: Props) {
  const { username } = await params;
  const session = await auth();

  const studio = await prisma.studio.findUnique({
    where: { username },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          image: true,
          role: true,
          songs: {
            where: { isActive: true },
            orderBy: { aiScore: "desc" },
            take: 20,
          },
          licenses: {
            where: { status: "ACTIVE" },
            include: { song: { select: { title: true, artist: true } } },
            take: 10,
          },
          ownedLabel: { select: { id: true, name: true, slug: true } },
          _count: { select: { followers: true, following: true } },
          badges: { orderBy: { awardedAt: "asc" } },
        },
      },
    },
  });

  if (!studio) notFound();

  const { user } = studio;

  const isOwner = session?.user?.id === user.id;

  // Is the current user following this artist?
  let isFollowing = false;
  if (session?.user?.id && !isOwner) {
    const follow = await prisma.userFollow.findUnique({
      where: {
        followerId_followingId: {
          followerId: session.user.id,
          followingId: user.id,
        },
      },
    });
    isFollowing = !!follow;
  }

  const avgScore =
    user.songs.length > 0
      ? user.songs.reduce((s, x) => s + x.aiScore, 0) / user.songs.length
      : 0;

  const totalLicensesSold = user.songs.reduce((s, x) => s + x.soldLicenses, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      {/* Banner */}
      <div
        className="mb-8 h-48 w-full overflow-hidden rounded-3xl bg-gradient-to-br from-brand-900 via-accent-600 to-brand-900"
        style={studio.bannerUrl ? { backgroundImage: `url(${studio.bannerUrl})`, backgroundSize: "cover" } : {}}
      />

      {/* Profile header */}
      <div className="-mt-16 flex items-end gap-5 px-4">
        <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-2xl border-4 border-[#0a0a0f] bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center text-3xl">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.image}
              alt={user.name ?? ""}
              width={192}
              height={192}
              loading="eager"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            "🎤"
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1 pb-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-extrabold">{user.name ?? username}</h1>
            <DistrictBadge district={studio.district} size="sm" />
            {/* Studio level badge */}
            <span className="rounded-full bg-white/8 border border-white/15 px-2.5 py-0.5 text-xs font-bold text-white/60">
              Lv.{studio.level}
            </span>
            {user.ownedLabel && (
              <a
                href={`/label/${user.ownedLabel.id}`}
                className="rounded-full bg-accent-500/20 px-2 py-0.5 text-xs font-medium text-accent-400 hover:bg-accent-500/40"
              >
                🏷️ {user.ownedLabel.name}
              </a>
            )}
          </div>
          <p className="text-sm text-white/50">@{studio.username}</p>
          <div className="flex items-center gap-4 text-xs text-white/40">
            <span>{user._count.followers} followers</span>
            <span>{user._count.following} following</span>
            <span>{totalLicensesSold} licenses sold</span>
          </div>
          {/* Badges row */}
          {user.badges.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {user.badges.map((b) => {
                const meta = BADGE_META[b.type as keyof typeof BADGE_META];
                return (
                  <span
                    key={b.id}
                    title={meta.description}
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.color}`}
                  >
                    {meta.icon} {meta.label}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Follow / Edit / Tip */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isOwner ? (
            <a
              href="/profile/edit"
              className="rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/10 transition"
            >
              Edit Profile
            </a>
          ) : session ? (
            <>
              <FollowButton
                targetUserId={user.id}
                initiallyFollowing={isFollowing}
                initialFollowerCount={user._count.followers}
              />
              <TipArtistButton artistId={user.id} artistName={user.name ?? username} />
            </>
          ) : (
            <a
              href="/auth/signin"
              className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold hover:bg-brand-600 transition"
            >
              Follow
            </a>
          )}
        </div>
      </div>

      {/* Bio */}
      {studio.bio && (
        <p className="mt-6 text-sm text-white/60 max-w-2xl">{studio.bio}</p>
      )}

      {/* Stats */}
      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "Songs", value: user.songs.length },
          { label: "Avg EMS Score", value: avgScore.toFixed(1) },
          { label: "Licenses Sold", value: totalLicensesSold },
          { label: "Licenses Held", value: user.licenses.length },
        ].map((s) => (
          <div key={s.label} className="glass rounded-2xl p-4 text-center">
            <p className="text-xs text-white/50">{s.label}</p>
            <p className="mt-1 text-xl font-bold text-brand-400">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Avg AI Score bar */}
      <div className="mt-6">
        <AiScoreBar score={avgScore} />
      </div>

      {/* Songs */}
      <section className="mt-10">
        <h2 className="mb-4 text-xl font-semibold">Songs</h2>
        {user.songs.length === 0 ? (
          <div className="glass rounded-2xl p-8 text-center text-white/30">
            <p>No songs uploaded yet.</p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {user.songs.map((song) => (
              <SongCard
                key={song.id}
                id={song.id}
                title={song.title}
                artist={song.artist}
                genre={song.genre}
                coverUrl={song.coverUrl}
                audioUrl={song.audioUrl}
                licensePrice={song.licensePrice.toString()}
                revenueSharePct={song.revenueSharePct.toString()}
                soldLicenses={song.soldLicenses}
                totalLicenses={song.totalLicenses}
                bpm={song.bpm}
                musicalKey={song.key}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
