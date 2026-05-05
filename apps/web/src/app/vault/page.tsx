import Link from "next/link";
import type { Metadata } from "next";
import SongCard from "@/components/SongCard";
import { prisma } from "@/lib/prisma";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "The Vault — Legacy Catalogs on Epic Music Space",
  description:
    "Older releases, archived demos, and back-when-I-used-to-rap material from working artists. Stream it, license it, hear it like it's brand new.",
  openGraph: {
    title: "The Vault — Legacy Catalogs on EMS",
    description:
      "Older releases, archived demos, and back-when-I-used-to-rap material from working artists. The vault is open.",
  },
  alternates: { canonical: "/vault" },
};

const PAGE_SIZE = 48;

export default async function VaultPage() {
  const songs = await prisma.song
    .findMany({
      where: { isActive: true, isLegacy: true },
      orderBy: [{ originalReleaseYear: "desc" }, { createdAt: "desc" }],
      take: PAGE_SIZE,
      include: {
        artist_: {
          select: {
            name: true,
            studio: { select: { username: true } },
          },
        },
      },
    })
    .catch(() => []);

  const totalCount = await prisma.song
    .count({ where: { isActive: true, isLegacy: true } })
    .catch(() => songs.length);

  const eras = new Map<string, number>();
  for (const song of songs) {
    if (!song.originalReleaseYear) continue;
    const decade = `${Math.floor(song.originalReleaseYear / 10) * 10}s`;
    eras.set(decade, (eras.get(decade) ?? 0) + 1);
  }
  const eraEntries = [...eras.entries()].sort(([a], [b]) => (a < b ? 1 : -1));

  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      {/* Hero */}
      <section className="overflow-hidden rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-amber-500/4 to-transparent px-6 py-12 shadow-[0_30px_60px_-30px_rgba(245,158,11,0.45)] sm:px-10 sm:py-16">
        <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-amber-300">
          The vault is open
        </p>
        <h1 className="mt-3 text-4xl font-extrabold leading-tight text-amber-50 sm:text-5xl">
          Legacy catalogs from artists{" "}
          <span className="text-amber-300">who&apos;ve been doing this</span>{" "}
          for a long time.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-amber-100/70 sm:text-lg">
          Older releases. Demos that never got their moment. Back-when-I-used-to-rap
          tapes. Records that disappeared off streaming — pulled back into the
          light, tagged with the year they came out, ready to stream and license.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link
            href="/auth/signup?role=ARTIST&callbackUrl=%2Fstudio%2Fnew%3Flegacy%3D1"
            className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-amber-950 transition hover:bg-amber-300"
          >
            Add your vault tracks →
          </Link>
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-3 text-sm font-semibold text-amber-100 hover:bg-amber-500/12"
          >
            Or browse current releases
          </Link>
        </div>
      </section>

      {/* Era pills */}
      {eraEntries.length > 0 && (
        <div className="mt-8 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300/70">
            Eras represented
          </span>
          {eraEntries.map(([decade, count]) => (
            <span
              key={decade}
              className="rounded-full border border-amber-500/30 bg-amber-500/8 px-3 py-1 text-xs font-semibold text-amber-100"
            >
              {decade} · {count}
            </span>
          ))}
        </div>
      )}

      {/* Tracks */}
      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-xl font-bold text-amber-50">
              Newest in the vault
            </h2>
            <p className="text-sm text-white/55">
              {totalCount} legacy track{totalCount === 1 ? "" : "s"} on file
            </p>
          </div>
        </div>

        {songs.length === 0 ? (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/4 px-6 py-12 text-center">
            <p className="text-2xl">📼</p>
            <p className="mt-3 text-base font-bold text-amber-100">
              The vault is waiting on its first tape.
            </p>
            <p className="mt-1 text-sm text-amber-100/65">
              When artists upload tracks marked as legacy, they show up here.
            </p>
            <Link
              href="/auth/signup?role=ARTIST&callbackUrl=%2Fstudio%2Fnew%3Flegacy%3D1"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-amber-950 hover:bg-amber-300"
            >
              Drop in the first one →
            </Link>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {songs.map((song) => {
              const studioUsername = song.artist_?.studio?.username;
              return (
                <div key={song.id} className="relative">
                  {song.originalReleaseYear && (
                    <span className="absolute -top-2 left-3 z-10 rounded-full border border-amber-500/50 bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-black tracking-[0.2em] text-amber-100 shadow-md">
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
                  {studioUsername && (
                    <Link
                      href={`/studio/${studioUsername}`}
                      className="mt-2 inline-block text-xs font-semibold text-amber-300 hover:text-amber-200 hover:underline"
                    >
                      Visit {song.artist_?.name ?? song.artist}&apos;s studio →
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
