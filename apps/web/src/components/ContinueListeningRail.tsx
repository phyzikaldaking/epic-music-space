import Link from "next/link";
import Image from "next/image";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStreamUrl } from "@/lib/audioStream";

/**
 * Server-rendered rail of the user's last 6 distinct songs they viewed/played.
 * Reads from UserBehaviorEvent so it works even before they have a license.
 */
export default async function ContinueListeningRail() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const events = await prisma.userBehaviorEvent
    .findMany({
      where: {
        userId: session.user.id,
        songId: { not: null },
        eventType: { in: ["view", "view_track"] },
      },
      orderBy: { createdAt: "desc" },
      distinct: ["songId"],
      take: 6,
      select: {
        song: {
          select: {
            id: true,
            title: true,
            artist: true,
            coverUrl: true,
            isActive: true,
          },
        },
      },
    })
    .catch(() => []);

  const songs = events
    .map((e) => e.song)
    .filter((s): s is NonNullable<typeof s> => !!s && s.isActive);

  if (songs.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-white/55">
          Continue listening
        </h2>
        <Link href="/marketplace" className="text-xs text-brand-300 hover:underline">
          Browse all →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {songs.map((s) => (
          <Link
            key={s.id}
            href={`/track/${s.id}`}
            className="group rounded-xl border border-white/8 bg-white/3 p-2 hover:bg-white/6"
            title={`${s.title} — ${s.artist}`}
          >
            <div className="relative aspect-square overflow-hidden rounded-lg bg-brand-900">
              {s.coverUrl ? (
                <Image
                  src={s.coverUrl}
                  alt=""
                  fill
                  unoptimized
                  className="object-cover transition group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-3xl">🎵</div>
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 transition group-hover:opacity-100 flex items-center justify-center">
                <svg className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
            <p className="mt-2 truncate text-xs font-bold">{s.title}</p>
            <p className="truncate text-[10px] text-white/45">{s.artist}</p>
            {/* Make stream URL available to crawlers via attribute, so /api/song discoverability remains 1st-class */}
            <meta itemProp="contentUrl" content={getStreamUrl(s.id)} />
          </Link>
        ))}
      </div>
    </section>
  );
}
