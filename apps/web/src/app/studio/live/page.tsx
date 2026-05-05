import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { DISTRICT_META } from "@/lib/scoring";
import { isRoomExpired } from "@/lib/roomTier";
import type { Metadata } from "next";

export const revalidate = 30;

export const metadata: Metadata = {
  title: "Listening Sessions — Epic Music Space",
  description:
    "Drop into live listening rooms hosted by artists. Hear albums in real time, react in chat, raise your hand to take the floor, and license tracks while the music's still playing.",
};

type SessionStudio = {
  username: string;
  level: number;
  bio: string | null;
  district: string;
  user: {
    id: string;
    name: string | null;
    image: string | null;
    songs: {
      id: string;
      title: string;
      artist: string;
      genre: string | null;
      coverUrl: string | null;
      aiScore: number;
      streamCount: number;
      soldLicenses: number;
    }[];
    _count: { followers: number };
  };
};

const GENRE_LABELS: Record<string, string> = {
  all: "All Rooms",
  "Hip-Hop": "Hip-Hop",
  Trap: "Trap",
  "R&B": "R&B",
  Pop: "Pop",
  Electronic: "Electronic",
  Jazz: "Jazz",
  "Lo-Fi": "Lo-Fi",
  Drill: "Drill",
};

export default async function VirtualStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ genre?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/studio/live");
  }

  const { genre } = await searchParams;
  const activeGenre = genre ?? "all";

  // Fetch the current user's own studio username so "My Studio" links correctly
  const myStudio = await prisma.studio.findFirst({
    where: { userId: session.user.id },
    select: { username: true, bio: true },
  });

  // Active live rooms (LiveKit-backed listening sessions)
  const liveRoomRows = await prisma.room.findMany({
    where: { status: "LIVE" },
    orderBy: { startedAt: "desc" },
    take: 12,
    include: {
      host: { select: { id: true, name: true, image: true, username: true, subscriptionTier: true } },
      currentSong: { select: { title: true, artist: true, coverUrl: true } },
      _count: { select: { participants: { where: { leftAt: null } } } },
    },
  });
  const now = new Date();
  const expiredRoomIds = liveRoomRows
    .filter((room) => isRoomExpired(room.startedAt, room.host.subscriptionTier, now))
    .map((room) => room.id);
  if (expiredRoomIds.length > 0) {
    await prisma.room.updateMany({
      where: { id: { in: expiredRoomIds }, status: "LIVE" },
      data: { status: "ENDED", endedAt: now },
    });
  }
  const liveRooms = liveRoomRows.filter((room) => !expiredRoomIds.includes(room.id));

  // Fetch studios with recently active songs — these are the "live sessions"
  const studios = await prisma.studio.findMany({
    where: {
      user: {
        songs: {
          some: {
            isActive: true,
            ...(activeGenre !== "all" ? { genre: activeGenre } : {}),
          },
        },
      },
    },
    orderBy: { level: "desc" },
    take: 24,
    select: {
      username: true,
      level: true,
      bio: true,
      district: true,
      user: {
        select: {
          id: true,
          name: true,
          image: true,
          songs: {
            where: {
              isActive: true,
              ...(activeGenre !== "all" ? { genre: activeGenre } : {}),
            },
            orderBy: { aiScore: "desc" },
            take: 3,
            select: {
              id: true,
              title: true,
              artist: true,
              genre: true,
              coverUrl: true,
              aiScore: true,
              streamCount: true,
              soldLicenses: true,
            },
          },
          _count: { select: { followers: true } },
        },
      },
    },
  }) as SessionStudio[];

  // Separate featured (high level) from regular studios
  const featured = studios.filter((s) => s.level >= 3).slice(0, 3);
  const rest = studios.filter((s) => !featured.includes(s));

  // Get global listen stats
  const [totalSongs, totalStreams] = await Promise.all([
    prisma.song.count({ where: { isActive: true } }),
    prisma.song.aggregate({ where: { isActive: true }, _sum: { streamCount: true } }),
  ]);

  const genreCount = await prisma.song.groupBy({
    by: ["genre"],
    where: { isActive: true, genre: { not: null } },
    _count: { genre: true },
    orderBy: { _count: { genre: "desc" } },
    take: 8,
  });

  const availableGenres = ["all", ...genreCount.map((g) => g.genre!).filter(Boolean)];

  return (
    <div className="relative min-h-screen bg-[#050509]">
      {/* Ambient glows */}
      <div className="pointer-events-none fixed top-0 left-1/4 h-[600px] w-[700px] rounded-full bg-brand-500/8 blur-[140px]" />
      <div className="pointer-events-none fixed bottom-0 right-1/4 h-[400px] w-[500px] rounded-full bg-accent-500/6 blur-[120px]" />

      <div className="relative mx-auto max-w-7xl px-4 py-12">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/8 px-3 py-1 text-xs font-bold text-brand-400">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400 studio-live-pulse" />
              Live Rooms
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">
              Listening <span className="text-gradient-ems">Sessions</span>
            </h1>
            <p className="mt-3 max-w-xl text-white/45">
              Live audio rooms hosted by artists. Hear the album, talk between
              tracks, raise your hand to take the floor, and license songs
              while the music&apos;s still playing.
            </p>
          </div>

          {/* Quick stats */}
          <div className="flex gap-4 text-center">
            <div className="rounded-2xl border border-white/8 bg-white/3 px-5 py-3">
              <p className="text-2xl font-black text-brand-400">{studios.length}</p>
              <p className="text-xs text-white/40">Studios Live</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/3 px-5 py-3">
              <p className="text-2xl font-black text-accent-400">{totalSongs.toLocaleString()}</p>
              <p className="text-xs text-white/40">Tracks Available</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/3 px-5 py-3">
              <p className="text-2xl font-black text-gold-400">
                {((totalStreams._sum.streamCount ?? 0) / 1000).toFixed(0)}K
              </p>
              <p className="text-xs text-white/40">Total Plays</p>
            </div>
          </div>
        </div>

        {/* ── Live rooms (LiveKit-backed) ─────────────────────────────────── */}
        {liveRooms.length > 0 && (
          <div className="mb-10">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white/80">
                🔴 Live Right Now
                <span className="ml-2 text-sm font-normal text-white/30">
                  {liveRooms.length} room{liveRooms.length === 1 ? "" : "s"} open
                </span>
              </h2>
              <Link href="/rooms/new" className="text-sm font-bold text-brand-300 hover:text-brand-200">
                + Host yours
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {liveRooms.map((r) => (
                <Link
                  key={r.id}
                  href={`/rooms/${r.id}`}
                  className="flex flex-col gap-3 rounded-2xl border border-brand-500/25 bg-brand-500/5 p-4 transition hover:border-brand-500/50 hover:bg-brand-500/10"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-brand-500/20">
                      {r.host.image ? (
                        <Image src={r.host.image} alt={r.host.name ?? ""} fill sizes="40px" className="object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm font-bold text-brand-300">
                          {(r.host.name ?? "?")[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{r.title}</p>
                      <p className="truncate text-xs text-white/45">
                        Hosted by {r.host.name ?? r.host.username ?? "Artist"}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                      LIVE
                    </span>
                  </div>
                  {r.currentSong && (
                    <p className="truncate text-xs text-white/55">
                      🎵 Now playing: <span className="text-white/80">{r.currentSong.title}</span>
                    </p>
                  )}
                  <div className="flex items-center justify-between text-xs text-white/35">
                    <span>{r._count.participants} in the room</span>
                    <span className="font-semibold text-brand-300">Drop in →</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Host your own session CTA ──────────────────────────────────── */}
        <div className="mb-10 overflow-hidden rounded-3xl border border-brand-500/25 bg-gradient-to-r from-brand-500/10 via-accent-500/6 to-transparent p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="mb-1 text-lg font-extrabold">🎙️ Host a Listening Session</p>
              <p className="text-sm text-white/50">
                Upload a track and your studio opens as a live room. Pass the
                mic, take questions, and let fans license your music while
                they&apos;re still in the chat.
              </p>
            </div>
            <div className="flex gap-3 flex-shrink-0">
              <Link
                href="/rooms/new"
                className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-6 py-3 text-sm font-bold text-white transition hover:bg-brand-600 glow-purple-sm"
              >
                🎙️ Open a Room
              </Link>
              {session.user && (
                <Link
                  href={myStudio ? `/studio/${myStudio.username}` : "/studio/new"}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-white/70 transition hover:bg-white/6 hover:text-white"
                >
                  My Studio
                </Link>
              )}
            </div>
          </div>
          {myStudio && !myStudio.bio && (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-amber-400/20 bg-amber-400/8 px-4 py-2">
              <p className="text-xs text-amber-300/80">Your studio profile is incomplete — add a bio and choose your district so fans can find you.</p>
              <Link href="/studio/setup" className="shrink-0 text-xs font-bold text-amber-300 hover:text-amber-200 transition">
                Complete Profile →
              </Link>
            </div>
          )}
        </div>

        {/* ── Genre / mood filter ────────────────────────────────────────── */}
        <div className="mb-8 flex flex-wrap gap-2">
          {availableGenres.map((g) => (
            <Link
              key={g}
              href={g === "all" ? "/studio/live" : `/studio/live?genre=${encodeURIComponent(g)}`}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                activeGenre === g
                  ? "border-brand-500/60 bg-brand-500/20 text-brand-300"
                  : "border-white/10 bg-white/3 text-white/50 hover:border-white/20 hover:text-white/80"
              }`}
            >
              {GENRE_LABELS[g] ?? g}
            </Link>
          ))}
        </div>

        {studios.length === 0 ? (
          /* ── Empty state ──────────────────────────────────────────────── */
          <div className="rounded-3xl border border-white/8 bg-[#0d0d14] p-16 text-center">
            <div className="mb-4 flex justify-center">
              <span className="text-6xl">🎧</span>
            </div>
            <h2 className="mb-2 text-xl font-bold">No sessions yet</h2>
            <p className="mb-6 text-sm text-white/40">
              {activeGenre !== "all"
                ? `No ${activeGenre} sessions right now. Try a different genre or start your own.`
                : "Be the first to open a session. Upload a track and your studio goes live."}
            </p>
            <Link
              href="/studio/new"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-8 py-3 text-sm font-bold text-white hover:bg-brand-600 transition glow-purple-sm"
            >
              🎙️ Open Your Studio
            </Link>
          </div>
        ) : (
          <>
            {/* ── Featured sessions ────────────────────────────────────── */}
            {featured.length > 0 && (
              <div className="mb-10">
                <div className="mb-4 flex items-center gap-3">
                  <h2 className="text-lg font-bold text-white/80">⭐ Featured Sessions</h2>
                  <span className="rounded-full bg-gold-500/15 border border-gold-500/25 px-2.5 py-0.5 text-xs font-bold text-gold-400">
                    Top Studios
                  </span>
                </div>
                <div className="grid gap-5 md:grid-cols-3">
                  {featured.map((studio) => (
                    <FeaturedSessionCard key={studio.username} studio={studio} />
                  ))}
                </div>
              </div>
            )}

            {/* ── All sessions grid ────────────────────────────────────── */}
            {rest.length > 0 && (
              <div>
                <h2 className="mb-4 text-lg font-bold text-white/80">
                  🔊 All Sessions
                  <span className="ml-2 text-sm font-normal text-white/30">
                    {rest.length} rooms open
                  </span>
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {rest.map((studio) => (
                    <SessionCard key={studio.username} studio={studio} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── How it works ──────────────────────────────────────────────── */}
        <div className="mt-16 rounded-3xl border border-white/8 bg-[#0d0d14] p-8">
          <h2 className="mb-6 text-center text-lg font-bold text-white/70">
            How a listening session works
          </h2>
          <div className="grid gap-6 text-center md:grid-cols-3">
            {[
              {
                icon: "🎙️",
                title: "Artist hosts the room",
                desc: "Open a live audio session. Press play on your album, talk between tracks, and welcome fans into the same room as you.",
              },
              {
                icon: "🙋",
                title: "Fans take the floor",
                desc: "Listeners react in chat or raise a hand. You decide who speaks. It's a Q&A, a release party, and a concert in one.",
              },
              {
                icon: "💰",
                title: "Licenses sell live",
                desc: "Fans in the room are one tap from licensing the song they're hearing. Sales fire while the music's still rolling — you keep 90%.",
              },
            ].map((step) => (
              <div key={step.title} className="flex flex-col items-center gap-3">
                <span className="text-4xl">{step.icon}</span>
                <p className="font-bold">{step.title}</p>
                <p className="text-sm text-white/40">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Featured session card (large) ──────────────────────────────────────────
function FeaturedSessionCard({ studio }: { studio: SessionStudio }) {
  const topTrack = studio.user.songs[0];
  const districtMeta =
    studio.district in DISTRICT_META
      ? DISTRICT_META[studio.district as keyof typeof DISTRICT_META]
      : null;

  return (
    <Link
      href={`/studio/${studio.username}`}
      className="session-card-hover group relative flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#111118]"
    >
      {/* Cover / visual header */}
      <div className="relative h-44 w-full overflow-hidden bg-gradient-to-br from-brand-900/60 to-accent-900/40 flex items-center justify-center">
        {topTrack?.coverUrl ? (
          <Image
            src={topTrack.coverUrl}
            alt={topTrack.title}
            fill
            className="object-cover opacity-60 transition group-hover:opacity-80 group-hover:scale-105"
            unoptimized
          />
        ) : (
          <span className="text-6xl opacity-30">🎵</span>
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#111118] via-transparent to-transparent" />
        {/* Live badge */}
        <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full border border-brand-500/40 bg-[#111118]/80 px-2.5 py-1 text-xs font-bold text-brand-400 backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-400 studio-live-pulse" />
          LIVE
        </div>
        {/* District badge */}
        {districtMeta && (
          <div className="absolute top-3 right-3 rounded-full border border-white/15 bg-[#111118]/80 px-2.5 py-1 text-[10px] font-bold text-white/50 backdrop-blur-sm">
            {districtMeta.label}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full border border-white/15 bg-brand-500/20 flex items-center justify-center text-sm font-bold text-brand-400">
            {studio.user.image ? (
              <Image
                src={studio.user.image}
                alt={studio.user.name ?? studio.username}
                fill
                className="object-cover"
                unoptimized
              />
            ) : (
              (studio.user.name ?? studio.username)[0]?.toUpperCase()
            )}
          </div>
          <div>
            <p className="font-bold text-sm leading-tight">
              {studio.user.name ?? studio.username}
            </p>
            <p className="text-xs text-white/40">
              @{studio.username} · Lv.{studio.level}
            </p>
          </div>
        </div>

        {topTrack && (
          <div className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/8 p-3">
            <span className="text-base">🎵</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{topTrack.title}</p>
              <p className="text-xs text-white/40">{topTrack.genre ?? "Music"}</p>
            </div>
            <div className="flex-shrink-0 text-right">
              <p className="text-xs font-bold text-brand-400">{topTrack.aiScore.toFixed(0)}</p>
              <p className="text-[10px] text-white/25">score</p>
            </div>
          </div>
        )}

        <div className="mt-auto flex items-center justify-between text-xs text-white/35">
          <span>{studio.user._count.followers.toLocaleString()} followers</span>
          <span>{studio.user.songs.length} track{studio.user.songs.length !== 1 ? "s" : ""}</span>
        </div>

        <div className="rounded-xl bg-brand-500/15 border border-brand-500/25 py-2 text-center text-sm font-bold text-brand-400 transition group-hover:bg-brand-500/25">
          Enter Session →
        </div>
      </div>
    </Link>
  );
}

// ─── Regular session card (compact) ─────────────────────────────────────────
function SessionCard({ studio }: { studio: SessionStudio }) {
  const topTrack = studio.user.songs[0];

  return (
    <Link
      href={`/studio/${studio.username}`}
      className="session-card-hover group flex flex-col gap-3 rounded-2xl border border-white/8 bg-[#0d0d14] p-4 transition hover:border-brand-500/30 hover:bg-brand-500/4"
    >
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-full border border-white/12 bg-brand-500/15 flex items-center justify-center text-sm font-bold text-brand-400">
          {studio.user.image ? (
            <Image
              src={studio.user.image}
              alt={studio.user.name ?? studio.username}
              fill
              className="object-cover"
              unoptimized
            />
          ) : (
            (studio.user.name ?? studio.username)[0]?.toUpperCase()
          )}
          {/* Live indicator */}
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0d0d14] bg-brand-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-sm leading-tight">
            {studio.user.name ?? studio.username}
          </p>
          <p className="text-xs text-white/35">@{studio.username}</p>
        </div>
        <span className="flex-shrink-0 rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-bold text-brand-400">
          Lv{studio.level}
        </span>
      </div>

      {topTrack ? (
        <div className="flex items-center gap-2.5 rounded-xl bg-white/4 p-2.5">
          <div className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-lg bg-white/5 flex items-center justify-center text-sm">
            {topTrack.coverUrl ? (
              <Image
                src={topTrack.coverUrl}
                alt={topTrack.title}
                fill
                className="object-cover"
                unoptimized
              />
            ) : (
              "🎵"
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">{topTrack.title}</p>
            <p className="text-[11px] text-white/35">{topTrack.genre ?? "Music"}</p>
          </div>
          <span className="flex-shrink-0 text-xs font-bold text-brand-400">
            {topTrack.aiScore.toFixed(0)}
          </span>
        </div>
      ) : (
        <div className="rounded-xl bg-white/3 px-3 py-2 text-center text-xs text-white/25">
          No active tracks
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-white/30">
        <span>{studio.user._count.followers} listeners</span>
        <span className="font-semibold text-brand-400/70">Join →</span>
      </div>
    </Link>
  );
}
