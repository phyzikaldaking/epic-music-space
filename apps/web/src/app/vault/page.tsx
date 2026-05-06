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
    <div className="relative min-h-screen overflow-hidden bg-[#0d0a04]">
      {/* Ambient vault-room atmosphere — warm spot, brushed-brass glints,
          subtle grain so the page reads like a basement archive room
          rather than a flat web surface. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(245,158,11,0.28),transparent_55%),radial-gradient(circle_at_82%_18%,rgba(180,140,40,0.22),transparent_55%),radial-gradient(circle_at_50%_120%,rgba(120,80,15,0.35),transparent_60%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-screen [background-image:radial-gradient(rgba(255,200,120,0.6)_1px,transparent_1px)] [background-size:3px_3px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-full opacity-30 bg-[repeating-linear-gradient(115deg,rgba(245,158,11,0.04)_0_2px,transparent_2px_18px)] mix-blend-screen"
      />

      <main className="relative mx-auto max-w-6xl px-4 py-12">
        {/* Vault door hero — heavy gold border, brass studs, embossed
            "THE VAULT" plaque. Reads as the front of an archive room. */}
        <section className="relative overflow-hidden rounded-3xl border-2 border-amber-500/55 bg-gradient-to-b from-[#1a1305] via-[#0e0a02] to-[#0a0700] px-6 py-12 shadow-[inset_0_2px_0_rgba(245,200,120,0.18),0_30px_80px_-30px_rgba(245,158,11,0.6)] sm:px-12 sm:py-16">
          {/* Brass stud rivets along the border */}
          <div aria-hidden className="pointer-events-none absolute inset-x-6 top-3 flex justify-between sm:inset-x-12">
            {Array.from({ length: 9 }).map((_, i) => (
              <span
                key={`top-${i}`}
                className="h-1.5 w-1.5 rounded-full bg-gradient-to-br from-amber-300 to-amber-700 shadow-[0_0_8px_rgba(245,200,120,0.6),inset_0_1px_0_rgba(255,255,255,0.4)]"
              />
            ))}
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-x-6 bottom-3 flex justify-between sm:inset-x-12">
            {Array.from({ length: 9 }).map((_, i) => (
              <span
                key={`bot-${i}`}
                className="h-1.5 w-1.5 rounded-full bg-gradient-to-br from-amber-300 to-amber-700 shadow-[0_0_8px_rgba(245,200,120,0.6),inset_0_1px_0_rgba(255,255,255,0.4)]"
              />
            ))}
          </div>

          {/* Locked / unlocked status badge — top-right vault sign */}
          <div className="absolute right-4 top-4 sm:right-8 sm:top-8">
            <div className="flex items-center gap-2 rounded-md border-2 border-amber-400/65 bg-gradient-to-b from-amber-500/25 to-amber-700/15 px-3 py-1 font-black uppercase tracking-[0.32em] text-amber-100 shadow-[0_0_24px_rgba(245,200,120,0.35),inset_0_1px_0_rgba(255,255,255,0.18)]">
              <span aria-hidden className="text-base">🗝️</span>
              <span className="text-[10px]">Unlocked</span>
            </div>
          </div>

          {/* Embossed plaque — "THE VAULT" engraving */}
          <div className="relative">
            <p className="text-[10px] font-black uppercase tracking-[0.42em] text-amber-300/80">
              Epic Music Space · Archive Room
            </p>
            <h1 className="mt-2 font-serif text-5xl font-black leading-[0.95] tracking-tight text-amber-100 drop-shadow-[0_2px_0_rgba(120,80,15,0.6)] sm:text-7xl">
              The
              <br />
              <span className="bg-gradient-to-b from-amber-200 via-amber-100 to-amber-400 bg-clip-text text-transparent">
                Vault.
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-base text-amber-100/75 sm:text-lg">
              Older releases. Demos that never got their moment. Back-when-I-used-to-rap
              tapes. Records that disappeared off streaming — pulled back into the
              light, stamped with the year they came out, ready to stream and license.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="/auth/signup?role=ARTIST&callbackUrl=%2Fstudio%2Fnew%3Flegacy%3D1"
                className="inline-flex items-center gap-2 rounded-xl border-2 border-amber-400/65 bg-gradient-to-b from-amber-300 to-amber-500 px-5 py-3 text-sm font-black uppercase tracking-widest text-amber-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_8px_18px_-6px_rgba(245,158,11,0.6)] transition hover:from-amber-200 hover:to-amber-400"
              >
                Add your vault tracks →
              </Link>
              <Link
                href="/marketplace"
                className="inline-flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/8 px-5 py-3 text-sm font-semibold text-amber-100 hover:bg-amber-500/14"
              >
                Or browse current releases
              </Link>
            </div>
          </div>
        </section>

        {/* Era marquee — looks like dial labels on a safe */}
        {eraEntries.length > 0 && (
          <div className="mt-8 rounded-2xl border border-amber-500/25 bg-gradient-to-r from-[#1a1305]/80 via-[#0a0700]/80 to-[#1a1305]/80 px-5 py-3 backdrop-blur-md">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-[10px] font-black uppercase tracking-[0.32em] text-amber-300/85">
                Eras on file
              </span>
              {eraEntries.map(([decade, count]) => (
                <span
                  key={decade}
                  className="rounded-md border border-amber-500/40 bg-gradient-to-b from-amber-500/15 to-transparent px-3 py-1 text-xs font-bold tracking-wider text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                >
                  {decade}
                  <span className="ml-1.5 text-[10px] font-black text-amber-300/85">
                    × {count}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Catalog */}
        <section className="mt-12">
          <div className="mb-5 flex items-end justify-between border-b border-amber-500/20 pb-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.32em] text-amber-300/85">
                Newest in the vault
              </p>
              <h2 className="mt-1 font-serif text-2xl font-black text-amber-100">
                Records on display
              </h2>
            </div>
            <div className="text-right">
              <p className="font-serif text-3xl font-black text-amber-100">
                {totalCount}
              </p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-300/70">
                {totalCount === 1 ? "track" : "tracks"} on file
              </p>
            </div>
          </div>

          {songs.length === 0 ? (
            <div className="relative rounded-2xl border-2 border-amber-500/35 bg-gradient-to-b from-[#1a1305] to-[#0a0700] px-6 py-12 text-center shadow-[inset_0_2px_0_rgba(245,200,120,0.12)]">
              <p className="text-3xl">📼</p>
              <p className="mt-3 font-serif text-lg font-black text-amber-100">
                The vault is waiting on its first tape.
              </p>
              <p className="mt-1 text-sm text-amber-100/65">
                When artists upload tracks marked as legacy, they show up here.
              </p>
              <Link
                href="/auth/signup?role=ARTIST&callbackUrl=%2Fstudio%2Fnew%3Flegacy%3D1"
                className="mt-5 inline-flex items-center gap-2 rounded-xl border-2 border-amber-400/60 bg-gradient-to-b from-amber-300 to-amber-500 px-5 py-2 text-sm font-black uppercase tracking-widest text-amber-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] hover:from-amber-200 hover:to-amber-400"
              >
                Drop in the first one →
              </Link>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {songs.map((song) => {
                const studioUsername = song.artist_?.studio?.username;
                return (
                  <div
                    key={song.id}
                    className="group relative rounded-2xl border border-amber-500/25 bg-gradient-to-b from-[#15100a]/70 to-[#0a0700]/70 p-2 backdrop-blur-md transition hover:border-amber-400/50 hover:shadow-[0_18px_38px_-15px_rgba(245,158,11,0.45)]"
                  >
                    {/* Year stamp — engraved metallic plaque */}
                    {song.originalReleaseYear && (
                      <span className="absolute -top-2 left-4 z-10 rounded-md border border-amber-400/60 bg-gradient-to-b from-amber-300 to-amber-500 px-2 py-0.5 text-[10px] font-black tracking-[0.24em] text-amber-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_2px_6px_rgba(245,158,11,0.4)]">
                        {song.originalReleaseYear}
                      </span>
                    )}

                    {/* Top-right corner brass dot — gives a "tagged for the
                        archive" feel */}
                    <span
                      aria-hidden
                      className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-amber-400/90 shadow-[0_0_8px_rgba(245,200,120,0.6)]"
                    />

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
                        className="mt-2 inline-block px-2 text-xs font-semibold text-amber-300 hover:text-amber-200 hover:underline"
                      >
                        Visit {song.artist_?.name ?? song.artist}&apos;s
                        studio →
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Footer plate */}
        <div className="mx-auto mt-12 max-w-2xl rounded-xl border border-amber-500/20 bg-gradient-to-r from-transparent via-amber-500/8 to-transparent px-4 py-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-amber-300/70">
            🔒 Tagged · catalogued · always streaming
          </p>
        </div>
      </main>
    </div>
  );
}
