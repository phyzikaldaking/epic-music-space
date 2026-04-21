import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { formatPrice } from "@ems/utils";
import { notFound } from "next/navigation";
import AudioPlayer from "@/components/AudioPlayer";
import SongCard from "@/components/SongCard";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ checkout?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const song = await prisma.song.findUnique({
    where: { id },
    select: { title: true, artist: true, description: true, coverUrl: true, licensePrice: true, revenueSharePct: true },
  });
  if (!song) return { title: "Track Not Found" };

  const title = `${song.title} by ${song.artist} — EMS`;
  const description = song.description
    ?? `License "${song.title}" by ${song.artist} and earn ${String(song.revenueSharePct)}% streaming revenue forever. ${formatPrice(song.licensePrice)} per license on Epic Music Space.`;

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

export default async function StudioPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { checkout } = await searchParams;
  const session = await auth();

  const song = await prisma.song.findUnique({
    where: { id },
    include: {
      artist_: { select: { id: true, name: true, image: true } },
      _count: { select: { licenses: true } },
    },
  });

  if (!song) notFound();

  // Related: same genre, exclude current, ordered by aiScore
  const related = await prisma.song.findMany({
    where: {
      isActive: true,
      id: { not: id },
      ...(song.genre ? { genre: { equals: song.genre, mode: "insensitive" as const } } : {}),
    },
    orderBy: [{ aiScore: "desc" }, { soldLicenses: "desc" }],
    take: 4,
  });

  const remaining = song.totalLicenses - song.soldLicenses;
  const soldOutPct = Math.round((song.soldLicenses / song.totalLicenses) * 100);

  // Check if current user already holds a license
  let userLicense = null;
  if (session?.user?.id) {
    userLicense = await prisma.licenseToken.findFirst({
      where: { songId: id, holderId: session.user.id, status: "ACTIVE" },
    });
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      {/* Checkout status banners */}
      {checkout === "success" && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-green-500/30 bg-green-500/10 px-5 py-4 text-sm text-green-400">
          <span className="text-xl">✅</span>
          <div>
            <p className="font-semibold">Payment successful!</p>
            <p className="text-green-400/70">
              Your license is confirmed. Check{" "}
              <a href="/dashboard" className="underline hover:text-green-300">
                your dashboard
              </a>{" "}
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
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={song.coverUrl}
              alt={`${song.title} cover`}
              width={900}
              height={900}
              loading="eager"
              decoding="async"
              className="h-full w-full object-cover"
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

          {/* Audio preview player */}
          {song.audioUrl && (
            <AudioPlayer audioUrl={song.audioUrl} title={song.title} />
          )}

          {/* Licensing economics */}
          <div className="glass rounded-2xl p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-2xl font-extrabold text-brand-400">
                {formatPrice(song.licensePrice)}
              </span>
              <span className="text-sm text-white/60">
                {String(song.revenueSharePct)}% revenue share
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
              <div className="h-2 w-full rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-500 transition-all"
                  style={{ width: `${soldOutPct}%` }}
                />
              </div>
            </div>

            {/* CTA */}
            {userLicense ? (
              <div className="rounded-xl bg-green-500/20 px-4 py-3 text-center text-sm font-semibold text-green-400">
                ✓ You hold license #{userLicense.tokenNumber}
              </div>
            ) : remaining === 0 ? (
              <div className="rounded-xl bg-red-500/20 px-4 py-3 text-center text-sm font-semibold text-red-400">
                Sold out
              </div>
            ) : session ? (
              <form action="/api/checkout" method="POST">
                <input type="hidden" name="songId" value={song.id} />
                <button
                  type="submit"
                  className="w-full rounded-xl bg-brand-500 py-3 font-semibold text-white hover:bg-brand-600 transition"
                >
                  License this song for {formatPrice(song.licensePrice)}
                </button>
              </form>
            ) : (
              <a
                href="/auth/signin"
                className="block w-full rounded-xl bg-brand-500 py-3 text-center font-semibold text-white hover:bg-brand-600 transition"
              >
                Sign in to license
              </a>
            )}
          </div>

          <p className="text-xs text-white/30">
            Purchasing a license entitles you to {String(song.revenueSharePct)}%
            ÷ {song.totalLicenses} licenses of this song&apos;s streaming
            revenue, paid quarterly. This is a digital content license, not a
            security. See our{" "}
            <a href="/legal/licensing" className="underline hover:text-white/60">
              Licensing Agreement
            </a>
            .
          </p>
        </div>
      </div>

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
                aiScore={r.aiScore}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
