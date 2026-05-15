import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { isRoomExpired } from "@/lib/roomTier";

export const revalidate = 30;

export const metadata = {
  title: "Listening Sessions",
  description: "Live audio rooms hosted by artists right now.",
};

export default async function RoomsIndexPage() {
  // Anonymous visitors can browse who's live — that's the whole point
  // of "drop in to watch." The room detail page handles the sign-in
  // CTA for actually joining the LiveKit audio call.

  const roomRows = await prisma.room.findMany({
    where: { status: "LIVE" },
    orderBy: { startedAt: "desc" },
    take: 24,
    include: {
      host: { select: { name: true, image: true, username: true, subscriptionTier: true } },
      currentSong: { select: { title: true, artist: true, coverUrl: true } },
      _count: { select: { participants: { where: { leftAt: null } } } },
    },
  });
  const now = new Date();
  const expiredRoomIds = roomRows
    .filter((room) => isRoomExpired(room.startedAt, room.host.subscriptionTier, now))
    .map((room) => room.id);
  if (expiredRoomIds.length > 0) {
    await prisma.room.updateMany({
      where: { id: { in: expiredRoomIds }, status: "LIVE" },
      data: { status: "ENDED", endedAt: now },
    });
  }
  const liveRooms = roomRows.filter((room) => !expiredRoomIds.includes(room.id));

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-widest text-brand-300">
            Live now
          </p>
          <h1 className="text-3xl font-extrabold">Listening Sessions</h1>
          <p className="mt-1 text-sm text-white/55">
            Drop into a live audio room. Hear the album, raise your hand to
            take the floor, license a song while it&apos;s still playing.
          </p>
        </div>
        <Link
          href="/auth/signin?callbackUrl=/rooms/new"
          className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-600"
        >
          🎙️ Open a Room
        </Link>
      </div>

      {liveRooms.length === 0 ? (
        <div className="rounded-3xl border border-white/8 studio-faceplate-dark p-16 text-center">
          <p className="text-6xl">🎧</p>
          <h2 className="mt-4 text-xl font-bold">No live rooms right now</h2>
          <p className="mt-2 max-w-md mx-auto text-sm text-white/45">
            Be the first to host. Sign in to open a room, press play, and watch your fans
            drop in from anywhere in the world.
          </p>
          <Link
            href="/auth/signin?callbackUrl=/rooms/new"
            className="mt-6 inline-block rounded-xl bg-brand-500 px-6 py-3 text-sm font-bold text-white hover:bg-brand-600"
          >
            Open a Room →
          </Link>
        </div>
      ) : (
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
                  🎵 Now playing:{" "}
                  <span className="text-white/80">{r.currentSong.title}</span>
                </p>
              )}
              <div className="flex items-center justify-between text-xs text-white/35">
                <span>{r._count.participants} in the room</span>
                <span className="font-semibold text-brand-300">Drop in →</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
