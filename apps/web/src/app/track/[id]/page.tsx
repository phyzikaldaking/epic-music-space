import Link from "next/link";
import Image from "next/image";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { formatPrice } from "@ems/utils";
import { notFound } from "next/navigation";
import AudioPlayer from "@/components/AudioPlayer";
import SongCard from "@/components/SongCard";
import LicenseButton from "@/components/LicenseButton";
import ReportUserButton from "@/components/ReportUserButton";
import TrackActions from "@/components/TrackActions";
import { getStreamUrl } from "@/lib/audioStream";
import SaveTrackButton from "@/components/SaveTrackButton";
import EmbeddedAudioPreview from "@/components/EmbeddedAudioPreview";
import { classifyAudioSource } from "@/lib/audioSource";
import type { Metadata } from "next";
import { getDemoTracks } from "@/lib/demoTracks";
import { CACHE_TAGS } from "@/lib/cacheTags";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ checkout?: string }>;
}

type TrackDetail = {
  id: string;
  title: string;
  artist: string;
  description: string | null;
  coverUrl: string | null;
  audioUrl: string | null;
  genre: string | null;
  bpm: number | null;
  key: string | null;
  licensePrice: { toString(): string };
  revenueSharePct: { toString(): string };
  soldLicenses: number;
  totalLicenses: number;
  aiScore: number | null;
  isActive: boolean;
  hasStems: boolean;
  allowFreeDownload: boolean;
  artist_: { id: string; name: string | null; image: string | null } | null;
  _count: { licenses: number };
  isDemo: boolean;
};

const getTrack = unstable_cache(
  async (id: string): Promise<TrackDetail | null> => {
    try {
      const song = await prisma.song.findUnique({
        where: { id },
        include: {
          artist_: { select: { id: true, name: true, image: true } },
          _count: { select: { licenses: true } },
        },
      });
      if (song) return { ...song, isDemo: false } as TrackDetail;
    } catch {
      // DB unavailable — fall through to demo check
    }

    const demoTracks = await getDemoTracks();
    const demo = demoTracks.find((d) => d.id === id);
    if (demo) {
      return {
        id: demo.id,
        title: demo.title,
        artist: demo.artist,
        description: demo.description,
        coverUrl: demo.coverUrl,
        audioUrl: demo.audioUrl,
        genre: demo.genre,
        bpm: demo.bpm,
        key: demo.key,
        licensePrice: { toString: () => demo.licensePrice },
        revenueSharePct: { toString: () => demo.revenueSharePct },
        soldLicenses: demo.soldLicenses,
        totalLicenses: demo.totalLicenses,
        aiScore: demo.aiScore,
        isActive: true,
        hasStems: false,
        allowFreeDownload: false,
        artist_: null,
        _count: { licenses: demo.soldLicenses },
        isDemo: true,
      };
    }

    return null;
  },
  ["track-detail"],
  { revalidate: 300, tags: [CACHE_TAGS.songs] },
);

const getRelatedTracks = unstable_cache(
  async (id: string, genre: string | null): Promise<TrackDetail[]> => {
    if (!genre) return [];

    try {
      const rows = await prisma.song.findMany({
        where: {
          isActive: true,
          id: { not: id },
          genre: { equals: genre, mode: "insensitive" },
        },
        orderBy: [{ aiScore: "desc" }, { soldLicenses: "desc" }],
        take: 4,
        include: {
          artist_: { select: { id: true, name: true, image: true } },
          _count: { select: { licenses: true } },
        },
      });

      return rows.map((row) => ({ ...row, isDemo: false }));
    } catch {
      return [];
    }
  },
  ["track-related"],
  { revalidate: 300, tags: [CACHE_TAGS.songs] },
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const song = await getTrack(id);
  if (!song) return { title: "Track Not Found" };

  const title = `${song.title} by ${song.artist} — EMS`;
  const description =
    song.description ??
    `License "${song.title}" by ${song.artist} and earn ${song.revenueSharePct.toString()}% streaming revenue forever. ${formatPrice(song.licensePrice)} per license on Epic Music Space.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: song.coverUrl ? [{ url: song.coverUrl }] : [],
      type: "music.song",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: song.coverUrl ? [song.coverUrl] : [],
    },
  };
}

export default async function TrackPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { checkout } = await searchParams;

  const [song, session] = await Promise.all([getTrack(id), auth()]);
  if (!song) notFound();

  const remaining = song.totalLicenses - song.soldLicenses;
  const soldOutPct = song.totalLicenses > 0
    ? Math.round((song.soldLicenses / song.totalLicenses) * 100)
    : 0;

  const isOwner =
    !song.isDemo &&
    !!session?.user?.id &&
    !!song.artist_?.id &&
    session.user.id === song.artist_.id;

  const initialSaved = !song.isDemo && session?.user?.id
    ? !!(await prisma.savedTrack.findUnique({
        where: { userId_songId: { userId: session.user.id, songId: id } },
      }).catch(() => null))
    : false;

  const [related, userLicense, ownerStats] = await Promise.all([
    song.isDemo ? Promise.resolve([]) : getRelatedTracks(id, song.genre),
    !song.isDemo && session?.user?.id
      ? prisma.licenseToken.findFirst({
          where: { songId: id, holderId: session.user.id, status: "ACTIVE" },
        }).catch(() => null)
      : Promise.resolve(null),
    isOwner
      ? (async () => {
          const [behaviorCounts, recentBuyers, distinctListeners] = await Promise.all([
            prisma.userBehaviorEvent.groupBy({
              by: ["eventType"],
              where: { songId: id },
              _count: { _all: true },
            }).catch(() => [] as Array<{ eventType: string; _count: { _all: number } }>),
            prisma.licenseToken.findMany({
              where: { songId: id },
              orderBy: { purchasedAt: "desc" },
              take: 5,
              select: {
                id: true,
                holderId: true,
                purchasedAt: true,
                price: true,
                holder: { select: { name: true, image: true, studio: { select: { username: true } } } },
              },
            }).catch(() => []),
            prisma.userBehaviorEvent.findMany({
              where: { songId: id, eventType: "view_track" },
              distinct: ["userId"],
              select: { userId: true },
            }).catch(() => []),
          ]);
          const counts: Record<string, number> = {};
          for (const c of behaviorCounts) counts[c.eventType] = c._count._all;
          return {
            views: counts["view_track"] ?? 0,
            plays: counts["view"] ?? 0,
            likes: counts["like"] ?? 0,
            shares: counts["share"] ?? 0,
            distinctListeners: distinctListeners.length,
            recentBuyers: recentBuyers.map((b) => ({
              id: b.id,
              holderId: b.holderId,
              purchasedAt: b.purchasedAt,
              price: Number(b.price),
              holderName: b.holder.name,
              holderImage: b.holder.image,
              holderUsername: b.holder.studio?.username ?? null,
            })),
          };
        })()
      : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-2 text-xs text-white/45">
        <Link href="/marketplace" className="hover:text-white/75">
          Marketplace
        </Link>
        <span aria-hidden>›</span>
        {song.genre && (
          <>
            <Link
              href={`/marketplace?genre=${encodeURIComponent(song.genre)}`}
              className="hover:text-white/75"
            >
              {song.genre}
            </Link>
            <span aria-hidden>›</span>
          </>
        )}
        <span className="truncate text-white/65">{song.title}</span>
      </nav>

      {song.isDemo && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-5 py-4 text-sm text-cyan-300">
          <span className="text-xl">🎧</span>
          <div>
            <p className="font-semibold">Demo Track</p>
            <p className="text-cyan-300/70">
              This is a sample track. Real licensed music is available once artists upload to the marketplace.
            </p>
          </div>
        </div>
      )}

      {checkout === "success" && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-green-500/30 bg-green-500/10 px-5 py-4 text-sm text-green-400">
          <span className="text-xl">✅</span>
          <div>
            <p className="font-semibold">Payment successful!</p>
            <p className="text-green-400/70">
              Your license is confirmed. Check{" "}
              <Link href="/dashboard" className="underline hover:text-green-300">
                your dashboard
              </Link>{" "}
              for details.
            </p>
          </div>
        </div>
      )}
      {checkout === "cancelled" && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 px-5 py-4 text-sm text-yellow-400">
          <span className="text-xl">↩️</span>
          <div>
            <p className="font-semibold">Checkout cancelled</p>
            <p className="text-yellow-400/70">
              Your card was not charged. You can purchase a license any time.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-10 md:grid-cols-2">
        {/* Cover */}
        <div className="relative aspect-square overflow-hidden rounded-3xl bg-gradient-to-br from-brand-900 to-accent-600">
          {song.coverUrl ? (
            <Image
              src={song.coverUrl}
              alt={`${song.title} cover`}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              priority
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-8xl">
              🎵
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex flex-col gap-6">
          <div>
            {song.genre && (
              <span className="mb-2 inline-block rounded-full bg-brand-500/20 px-3 py-0.5 text-xs font-medium text-brand-400">
                {song.genre}
              </span>
            )}
            <h1 className="text-3xl font-extrabold">{song.title}</h1>
            <p className="mt-1 text-white/60">
              by {song.artist_?.name ?? song.artist}
            </p>
          </div>

          {song.description && (
            <p className="text-sm leading-relaxed text-white/60">
              {song.description}
            </p>
          )}

          {/* Meta */}
          <div className="grid grid-cols-2 gap-3">
            {song.bpm && (
              <div className="glass rounded-xl p-3 text-center">
                <p className="text-xs text-white/50">BPM</p>
                <p className="text-lg font-bold">{song.bpm}</p>
              </div>
            )}
            {song.key && (
              <div className="glass rounded-xl p-3 text-center">
                <p className="text-xs text-white/50">Key</p>
                <p className="text-lg font-bold">{song.key}</p>
              </div>
            )}
          </div>

          {/* Audio preview — streams through the same-origin proxy when
              the audio URL is a direct file, embeds the vendor player when
              it's a YouTube / Vimeo / SoundCloud / Spotify URL, and shows
              a graceful "preview unavailable" card otherwise. */}
          {song.audioUrl && (() => {
            const src = classifyAudioSource(song.audioUrl);
            if (src.type === "stream") {
              return (
                <AudioPlayer
                  audioUrl={getStreamUrl(song.id)}
                  title={song.title}
                  songId={song.id}
                />
              );
            }
            return (
              <EmbeddedAudioPreview audioUrl={song.audioUrl} title={song.title} />
            );
          })()}

          {/* Preview-only lock pill (when track isn't downloadable for the
              current viewer). This is messaging — actual download
              prevention is enforced server-side. */}
          {song.audioUrl && !userLicense && !song.allowFreeDownload && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/8 bg-white/3 px-3 py-2 text-xs text-white/55">
              <svg className="h-3.5 w-3.5 text-white/55" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path d="M12 1C9.24 1 7 3.24 7 6v3H6c-1.1 0-2 .9-2 2v9c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-9c0-1.1-.9-2-2-2h-1V6c0-2.76-2.24-5-5-5zm-3 8V6c0-1.66 1.34-3 3-3s3 1.34 3 3v3H9zm3 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" />
              </svg>
              <span>
                Preview only —{" "}
                {song.isDemo ? (
                  "demo track, not for sale."
                ) : remaining === 0 ? (
                  "sold out."
                ) : (
                  <>license below to download.</>
                )}
              </span>
            </div>
          )}

          {/* Save / wishlist (only for real songs, not demos) */}
          {!song.isDemo && (
            <div className="mt-3">
              <SaveTrackButton songId={song.id} initiallySaved={initialSaved} />
            </div>
          )}

          {/* Play in global player + Share — only for direct streams.
              Embed-only tracks (YouTube, etc.) can't play in the global
              player because the global player is an HTML5 <audio>
              element, not an iframe. */}
          {song.audioUrl && classifyAudioSource(song.audioUrl).type === "stream" && (
            <TrackActions
              song={{
                id: song.id,
                title: song.title,
                artist: song.artist_?.name ?? song.artist,
                audioUrl: getStreamUrl(song.id),
                coverUrl: song.coverUrl,
              }}
            />
          )}

          {/* Licensing economics */}
          <div className="glass rounded-2xl p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-2xl font-extrabold text-brand-400">
                {formatPrice(song.licensePrice)}
              </span>
              <span className="text-sm text-white/60">
                {song.revenueSharePct.toString()}% revenue share
              </span>
            </div>

            {/* Availability */}
            <div className="mb-4">
              <div className="mb-1 flex justify-between text-xs text-white/50">
                <span>
                  {remaining} of {song.totalLicenses} licenses available
                </span>
                <span>{soldOutPct}% sold</span>
              </div>
              <progress
                className="h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-white/10 [&::-webkit-progress-value]:bg-gradient-to-r [&::-webkit-progress-value]:from-brand-500 [&::-webkit-progress-value]:to-accent-500 [&::-moz-progress-bar]:bg-brand-500"
                value={soldOutPct}
                max={100}
                aria-label={`${soldOutPct}% of licenses sold`}
              />
            </div>

            {/* Download trackout for existing license holders */}
            {!song.isDemo && userLicense && song.hasStems && (
              <a
                href={`/api/licenses/${userLicense.id}/download`}
                className="mb-3 flex items-center justify-center gap-2 rounded-xl border border-brand-500/40 bg-brand-500/10 py-3 text-sm font-semibold text-brand-300 transition hover:bg-brand-500/20"
              >
                ↓ Download Trackout / Stems
              </a>
            )}

            {/* CTA */}
            {song.isDemo ? (
              <div className="rounded-xl bg-cyan-500/20 px-4 py-3 text-center text-sm font-semibold text-cyan-300">
                Demo track — not available for purchase
              </div>
            ) : userLicense ? (
              <div className="rounded-xl bg-green-500/20 px-4 py-3 text-center text-sm font-semibold text-green-400">
                ✓ You hold license #{userLicense.tokenNumber}
              </div>
            ) : remaining === 0 ? (
              <div className="rounded-xl bg-red-500/20 px-4 py-3 text-center text-sm font-semibold text-red-400">
                Sold out
              </div>
            ) : session ? (
              <LicenseButton
                songId={song.id}
                licensePrice={song.licensePrice.toString()}
              />
            ) : (
              <a
                href={`/auth/signin?callbackUrl=/track/${song.id}`}
                className="block w-full rounded-xl bg-brand-500 py-3 text-center font-semibold text-white hover:bg-brand-600 transition"
              >
                Sign in to license
              </a>
            )}
          </div>

          {!song.isDemo && (
            <p className="text-xs text-white/30">
              Purchasing a license entitles you to {song.revenueSharePct.toString()}%
              ÷ {song.totalLicenses} licenses of this song&apos;s streaming
              revenue, paid quarterly. This is a digital content license, not a
              security. See our{" "}
              <Link href="/legal/licensing" className="underline hover:text-white/60">
                Licensing Agreement
              </Link>
              .
            </p>
          )}
        </div>
      </div>

      {/* Owner-only analytics */}
      {ownerStats && (
        <section className="mt-12 rounded-2xl border border-brand-500/25 bg-brand-500/4 p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="rounded-full bg-brand-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-brand-300">
              Artist view
            </span>
            <h2 className="text-lg font-bold">Track performance</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: "Page views", value: ownerStats.views },
              { label: "Plays", value: ownerStats.plays },
              { label: "Distinct listeners", value: ownerStats.distinctListeners },
              { label: "Likes", value: ownerStats.likes },
              { label: "Licenses sold", value: song.soldLicenses },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-white/8 bg-white/3 p-3">
                <p className="text-[10px] uppercase tracking-widest text-white/40">{s.label}</p>
                <p className="mt-1 text-xl font-extrabold tabular-nums">{s.value}</p>
              </div>
            ))}
          </div>
          {ownerStats.views > 0 && (
            <p className="mt-3 text-xs text-white/45">
              Conversion: {((song.soldLicenses / Math.max(ownerStats.views, 1)) * 100).toFixed(1)}% of visitors who view this track buy a license.
            </p>
          )}
          {ownerStats.recentBuyers.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-white/45">
                Recent buyers
              </h3>
              <ul className="space-y-1.5">
                {ownerStats.recentBuyers.map((b) => (
                  <li key={b.id} className="flex items-center gap-2 text-sm">
                    <span className="text-white/65">
                      {b.holderUsername ? (
                        <Link href={`/studio/${b.holderUsername}`} className="hover:underline">
                          {b.holderName ?? "anonymous"}
                        </Link>
                      ) : (
                        b.holderName ?? "anonymous"
                      )}
                    </span>
                    <span className="ml-auto text-xs text-white/35">
                      ${b.price.toFixed(2)} ·{" "}
                      {new Date(b.purchasedAt).toLocaleDateString()}
                    </span>
                    <ReportUserButton
                      reportedUserId={b.holderId}
                      context={{ kind: "transaction", id: b.id }}
                      label=""
                      className="rounded-md border border-white/10 bg-white/4 px-1.5 py-0.5 text-[10px] text-white/45 hover:bg-white/10"
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Related tracks */}
      {related.length > 0 && (
        <section className="mt-16">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-bold">
              More{song.genre ? ` ${song.genre}` : ""} tracks
            </h2>
            <a
              href={`/marketplace${song.genre ? `?genre=${encodeURIComponent(song.genre)}` : ""}`}
              className="text-sm text-brand-400 transition hover:text-brand-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
            >
              Browse all →
            </a>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((r) => (
              <SongCard
                key={r.id}
                id={r.id}
                title={r.title}
                artist={r.artist}
                genre={r.genre}
                coverUrl={r.coverUrl}
                audioUrl={r.audioUrl}
                licensePrice={r.licensePrice.toString()}
                revenueSharePct={r.revenueSharePct.toString()}
                soldLicenses={r.soldLicenses}
                totalLicenses={r.totalLicenses}
                bpm={r.bpm}
                musicalKey={r.key}
                aiScore={r.aiScore ?? undefined}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
