import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Saved tracks — Epic Music Space",
  robots: { index: false, follow: false },
};

export default async function SavedTracksPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/dashboard/saved");

  const rows = await prisma.savedTrack.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const songs = rows.length
    ? await prisma.song.findMany({
        where: { id: { in: rows.map((r) => r.songId) } },
        select: {
          id: true,
          title: true,
          artist: true,
          genre: true,
          coverUrl: true,
          licensePrice: true,
          isActive: true,
        },
      })
    : [];
  const bySongId = new Map(songs.map((s) => [s.id, s]));

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Saved tracks</h1>
        <Link href="/marketplace" className="text-xs text-brand-300 hover:underline">
          Browse marketplace →
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-white/3 p-10 text-center">
          <p className="mb-2 text-2xl">♡</p>
          <p className="text-sm text-white/55">
            You haven&apos;t saved any tracks yet. Tap &ldquo;Save&rdquo; on any
            track to keep it here for later.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => {
            const song = bySongId.get(r.songId);
            if (!song) return null;
            return (
              <li
                key={r.id}
                className={`rounded-2xl border bg-white/3 p-3 transition hover:bg-white/6 ${
                  song.isActive ? "border-white/8" : "border-white/8 opacity-50"
                }`}
              >
                <Link href={`/track/${song.id}`} className="flex gap-3">
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-brand-900">
                    {song.coverUrl ? (
                      <Image
                        src={song.coverUrl}
                        alt=""
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-2xl">
                        🎵
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{song.title}</p>
                    <p className="truncate text-xs text-white/45">
                      {song.artist}
                      {song.genre ? ` · ${song.genre}` : ""}
                    </p>
                    <p className="mt-1 text-xs font-bold text-brand-300">
                      ${Number(song.licensePrice).toFixed(0)}
                    </p>
                    {!song.isActive && (
                      <p className="mt-1 text-[10px] text-white/30">No longer available</p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
