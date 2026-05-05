import { cache, Suspense } from "react";
import Image from "next/image";
import AdSlot from "@/components/ads/AdSlot";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import AiScoreBar from "@/components/AiScoreBar";
import DistrictBadge from "@/components/DistrictBadge";
import SongCard from "@/components/SongCard";
import FollowButton from "@/components/FollowButton";
import TipArtistButton from "@/components/TipArtistButton";
import MessageButton from "@/components/MessageButton";
import ReportUserButton from "@/components/ReportUserButton";
import PostCard from "@/components/PostCard";
import { BADGE_META } from "@/lib/badges";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ username: string }>;
}

const getStudioByUsername = cache(async (username: string) =>
  prisma.studio.findUnique({
    where: { username },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          image: true,
          role: true,
          emailVerified: true,
          connectChargesEnabled: true,
          connectPayoutsEnabled: true,
          // Current catalog only — legacy tracks rendered in a separate
          // "Vault" section sourced via a parallel query below.
          songs: {
            where: { isActive: true, isLegacy: false },
            orderBy: { aiScore: "desc" },
            take: 20,
          },
          licenses: {
            where: { status: "ACTIVE" },
            include: { song: { select: { title: true, artist: true } } },
            take: 10,
          },
          ownedLabel: { select: { id: true, name: true, slug: true } },
          _count: { select: { followers: true, following: true, songs: true } },
          badges: { orderBy: { awardedAt: "asc" } },
          posts: {
            where: { isPublished: true },
            orderBy: { createdAt: "desc" },
            take: 10,
            include: {
              _count: { select: { likes: true, comments: true } },
            },
          },
          roomsHosted: {
            where: { recordings: { some: { status: "READY" } } },
            orderBy: { startedAt: "desc" },
            take: 8,
            select: {
              id: true,
              title: true,
              startedAt: true,
              recordings: {
                where: { status: "READY" },
                orderBy: { completedAt: "desc" },
                take: 1,
                select: { id: true, playbackUrl: true, durationSeconds: true, completedAt: true },
              },
            },
          },
        },
      },
    },
  }),
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const studio = await getStudioByUsername(username);
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
  const [session, studio] = await Promise.all([
    auth(),
    getStudioByUsername(username),
  ]);

  if (!studio) notFound();

  const { user } = studio;
  const isOwner = session?.user?.id === user.id;

  // Legacy / vault catalog — fetched separately so the main catalog query
  // stays small and indexed by the (artistId, isLegacy) compound index.
  const legacySongs = await prisma.song.findMany({
    where: { artistId: user.id, isActive: true, isLegacy: true },
    orderBy: [{ originalReleaseYear: "desc" }, { createdAt: "desc" }],
    take: 50,
  }).catch(() => [] as Awaited<ReturnType<typeof prisma.song.findMany>>);

  const follow =
    session?.user?.id && !isOwner
      ? await prisma.userFollow.findUnique({
          where: {
            followerId_followingId: {
              followerId: session.user.id,
              followingId: user.id,
            },
          },
        })
      : null;
  const isFollowing = !!follow;

  const avgScore =
    user.songs.length > 0
      ? user.songs.reduce((s, x) => s + x.aiScore, 0) / user.songs.length
      : 0;

  const totalLicensesSold = user.songs.reduce((s, x) => s + x.soldLicenses, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <Suspense><AdSlot location="STUDIO_SIDEBAR" className="mb-6" /></Suspense>
      {/* Banner */}
      <div className="relative mb-8 h-48 w-full overflow-hidden rounded-3xl bg-gradient-to-br from-brand-900 via-accent-600 to-brand-900">
        {studio.bannerUrl && (
          <Image
            src={studio.bannerUrl}
            alt=""
            fill
            sizes="(max-width: 1024px) 100vw, 1024px"
            className="object-cover"
            priority
          />
        )}
      </div>

      {/* Profile header */}
      <div className="-mt-16 flex items-end gap-5 px-4">
        <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-2xl border-4 border-[#0a0a0f] bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center text-3xl">
          {user.image ? (
            <Image
              src={user.image}
              alt={user.name ?? ""}
              width={192}
              height={192}
              priority
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
            {user.connectChargesEnabled && user.connectPayoutsEnabled ? (
              <span
                title="Identity + payouts verified via Stripe Connect"
                className="inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/12 px-2 py-0.5 text-[11px] font-bold text-sky-300"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M12 2l2.39 4.84 5.34.78-3.86 3.76.91 5.32L12 14.27l-4.78 2.43.91-5.32L4.27 7.62l5.34-.78z" />
                </svg>
                Verified
              </span>
            ) : user.emailVerified ? (
              <span
                title="Email verified — full identity verification pending"
                className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-white/55"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M9 16.2 4.8 12l-1.4 1.4L9 19l12-12-1.4-1.4z" />
                </svg>
                Email verified
              </span>
            ) : null}
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
              <MessageButton peerId={user.id} />
              {session.user.id !== user.id && (
                <ReportUserButton
                  reportedUserId={user.id}
                  context={{ kind: "profile", id: user.id }}
                />
              )}
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

      {/* Replay drops — saved listening sessions */}
      {user.roomsHosted.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-xl font-semibold">
            🎧 Replay Drops <span className="text-sm font-normal text-white/40">— saved listening sessions</span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {user.roomsHosted.map((r) => {
              const recording = r.recordings[0];
              const mins = recording?.durationSeconds
                ? Math.round(recording.durationSeconds / 60)
                : null;
              return (
                <div
                  key={r.id}
                  className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/3 p-4"
                >
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-2xl">
                    🎙️
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{r.title}</p>
                    <p className="text-xs text-white/40">
                      {new Date(r.startedAt).toLocaleDateString()}
                      {mins ? ` · ${mins} min` : ""}
                    </p>
                  </div>
                  {recording?.playbackUrl && (
                    <a
                      href={recording.playbackUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-600"
                    >
                      ▶ Play
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Posts / Timeline */}
      {user.posts.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-xl font-semibold">Updates</h2>
          <div className="space-y-4">
            {user.posts.map((p) => (
              <PostCard
                key={p.id}
                id={p.id}
                body={p.body}
                imageUrl={p.imageUrl}
                muxPlaybackId={p.muxPlaybackId}
                videoStatus={p.videoStatus}
                videoAspectRatio={p.videoAspectRatio}
                createdAt={p.createdAt}
                author={{
                  id: user.id,
                  name: user.name,
                  image: user.image,
                  role: user.role,
                  studio: { username: studio.username },
                }}
                likeCount={p._count.likes}
                commentCount={p._count.comments}
                likedByMe={false}
                isOwner={isOwner}
              />
            ))}
          </div>
        </section>
      )}

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

      {/* Legacy / Vault — older catalog grouped separately so it doesn't
          dominate "what's new from this artist." */}
      {legacySongs.length > 0 && (
        <section className="mt-12">
          <details className="group" open={legacySongs.length <= 6}>
            <summary className="flex cursor-pointer items-center justify-between rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/8 via-transparent to-transparent px-5 py-4 hover:bg-amber-500/12">
              <div className="flex items-center gap-3">
                <span className="text-2xl" aria-hidden>📼</span>
                <div>
                  <h2 className="text-base font-bold text-amber-100">
                    From the vault
                  </h2>
                  <p className="text-xs text-white/55">
                    Legacy catalog · {legacySongs.length} track{legacySongs.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold uppercase tracking-widest text-amber-200/60 group-open:hidden">
                show ↓
              </span>
              <span className="text-xs font-bold uppercase tracking-widest text-amber-200/60 hidden group-open:inline">
                hide ↑
              </span>
            </summary>

            <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {legacySongs.map((song) => (
                <div key={song.id} className="relative">
                  {song.originalReleaseYear && (
                    <span className="absolute -top-2 left-3 z-10 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold tracking-widest text-amber-200">
                      {song.originalReleaseYear}
                    </span>
                  )}
                  <SongCard
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
                </div>
              ))}
            </div>
          </details>
        </section>
      )}
    </div>
  );
}
