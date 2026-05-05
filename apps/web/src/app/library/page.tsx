import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SongCard from "@/components/SongCard";
import { getStreamUrl } from "@/lib/audioStream";

export const metadata: Metadata = {
  title: "Library — Epic Music Space",
  description: "Tracks you've saved on Epic Music Space.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/library");

  const rows = await prisma.savedTrack.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const songs = rows.length
    ? await prisma.song.findMany({
        where: { id: { in: rows.map((r) => r.songId) }, isActive: true },
        include: { artist_: { select: { name: true, image: true } } },
      })
    : [];
  const bySongId = new Map(songs.map((s) => [s.id, s]));

  const saved = rows
    .map((r) => {
      const song = bySongId.get(r.songId);
      if (!song) return null;
      return { savedAt: r.createdAt, song };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-widest text-white/45">
          Your library
        </p>
        <h1 className="mt-1 text-3xl font-extrabold text-gradient-ems">Saved tracks</h1>
        <p className="mt-1 text-sm text-white/55">
          Everything you&apos;ve hit Save on. Tap any cover to revisit, license, or share.
        </p>
      </div>

      {saved.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-[#141414] p-10 text-center">
          <p className="mb-3 text-4xl" aria-hidden>📀</p>
          <p className="text-sm font-semibold text-white/85">
            No saved tracks yet.
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-white/45">
            Tap the bookmark icon on any track to keep it here for later.
          </p>
          <Link
            href="/marketplace"
            className="mt-4 inline-block rounded-xl bg-brand-500 px-5 py-2 text-sm font-bold text-white hover:bg-brand-600"
          >
            Browse the marketplace
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {saved.map(({ song, savedAt }) => (
            <div key={song.id} className="flex flex-col">
              <SongCard
                id={song.id}
                title={song.title}
                artist={song.artist}
                genre={song.genre ?? null}
                coverUrl={song.coverUrl ?? null}
                audioUrl={getStreamUrl(song.id)}
                licensePrice={Number(song.licensePrice)}
                revenueSharePct={Number(song.revenueSharePct)}
                soldLicenses={song.soldLicenses}
                totalLicenses={song.totalLicenses}
                bpm={song.bpm ?? null}
                musicalKey={song.key ?? null}
                aiScore={song.aiScore ?? 0}
              />
              <p className="mt-2 text-[10px] uppercase tracking-widest text-white/35">
                Saved {new Date(savedAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
