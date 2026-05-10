import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader";

export const metadata: Metadata = {
  title: "Saved tracks",
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
  const activeSaved = songs.filter((song) => song.isActive).length;
  const totalValue = songs.reduce((sum, song) => sum + Number(song.licensePrice), 0);
  const averageValue = songs.length ? totalValue / songs.length : 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <DashboardPageHeader
        eyebrow="Personal shelf"
        title="Saved tracks"
        description="Keep the songs you want to come back to in one place, with a clean path back to the marketplace when you're ready."
        backHref="/dashboard"
        stats={[
          { label: "Saved", value: rows.length.toString(), tone: "brand" },
          { label: "Active", value: activeSaved.toString(), tone: "emerald" },
          { label: "Avg price", value: `$${averageValue.toFixed(0)}`, tone: "amber" },
        ]}
        actions={
          <>
            <Link
              href="/marketplace"
              className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600"
            >
              Browse marketplace
            </Link>
            <Link
              href="/dashboard"
              className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white/75 transition hover:bg-white/8"
            >
              Back to dashboard
            </Link>
          </>
        }
        aside={
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-300">
              Quick reminder
            </p>
            <p className="mt-2 text-lg font-semibold text-white">
              {rows.length > 0 ? "Your shortlist is ready" : "Start a shortlist"}
            </p>
            <p className="mt-1 text-sm leading-6 text-white/55">
              Saved tracks work best when they are easy to revisit. Keep this list lean, and use it to move from curiosity to checkout fast.
            </p>
          </div>
        }
      />

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-white/3 p-10 text-center">
          <p className="mb-2 text-2xl">♡</p>
          <p className="mx-auto max-w-md text-sm text-white/55">
            You haven&apos;t saved any tracks yet. Tap &ldquo;Save&rdquo; on any track to keep it here for later, then come back when you want to compare or buy.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link href="/marketplace" className="rounded-xl bg-brand-500 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-brand-600">
              Browse marketplace
            </Link>
            <Link href="/feed" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-white/75 transition hover:bg-white/8">
              Open feed
            </Link>
          </div>
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
