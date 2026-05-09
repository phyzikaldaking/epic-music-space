import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isLiveKitConfigured } from "@/lib/livekit";
import { isRoomExpired } from "@/lib/roomTier";
import RoomClient from "./RoomClient";
import RoomBattleStrip from "@/components/RoomBattleStrip";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RoomPage({ params }: Props) {
  const { id } = await params;
  const session = await auth();

  // Anonymous visitors get a *preview* of the live room rather than an
  // immediate redirect. The "drop in to watch" moment only works if
  // the room itself is the landing page — bouncing them to /auth/signin
  // first turned would-be visitors back at the door. They still need
  // to sign in to actually join the LiveKit audio call (LiveKit tokens
  // require identity), but they see what's happening and a one-tap CTA.
  const room = await prisma.room.findUnique({
    where: { id },
    include: {
      host: { select: { id: true, name: true, image: true, username: true, subscriptionTier: true } },
      currentSong: {
        select: { id: true, title: true, artist: true, genre: true, coverUrl: true, audioUrl: true, licensePrice: true, soldLicenses: true, totalLicenses: true },
      },
      _count: { select: { participants: { where: { leftAt: null } } } },
    },
  });
  if (!room) notFound();

  if (!session?.user?.id) {
    return (
      <SectionErrorBoundary title="Room preview">
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">
            {room.status === "LIVE" ? "● Live now" : "Session offline"}
          </p>
          <h1 className="mt-2 text-3xl font-extrabold text-gradient-ems sm:text-4xl">
            {room.title}
          </h1>
          <div className="mt-6 flex items-center justify-center gap-3 text-sm text-white/70">
            {room.host.image && (
              <Image
                src={room.host.image}
                alt=""
                width={36}
                height={36}
                unoptimized
                className="h-9 w-9 rounded-full"
              />
            )}
            <span>
              Hosted by{" "}
              <span className="font-semibold text-white">{room.host.name ?? "an artist"}</span>
            </span>
          </div>
          {room.currentSong && (
            <p className="mt-4 text-sm text-white/55">
              Now spinning: <span className="font-semibold text-white/85">{room.currentSong.title}</span> by{" "}
              <span className="font-semibold text-white/85">{room.currentSong.artist}</span>
            </p>
          )}
          {room.status === "LIVE" && (
            <p className="mt-2 text-xs text-white/40">
              {room._count.participants} listening right now
            </p>
          )}
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href={`/auth/signin?callbackUrl=${encodeURIComponent(`/rooms/${id}`)}`}
              className="rounded-xl bg-brand-500 px-6 py-3 text-sm font-bold text-white transition hover:bg-brand-600"
            >
              {room.status === "LIVE" ? "Sign in to join the room" : "Sign in to view"}
            </Link>
            <Link
              href={`/auth/signup?callbackUrl=${encodeURIComponent(`/rooms/${id}`)}`}
              className="rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-white/85 transition hover:bg-white/5"
            >
              Create a free account
            </Link>
          </div>
          <p className="mt-6 text-[11px] text-white/35">
            Hosts can invite anyone in the room on stage to collab, or leave you
            in listen-only.
          </p>
        </div>
      </SectionErrorBoundary>
    );
  }

  const expired = room.status === "LIVE" && isRoomExpired(room.startedAt, room.host.subscriptionTier);
  if (expired) {
    await prisma.room.update({
      where: { id },
      data: { status: "ENDED", endedAt: room.endedAt ?? new Date() },
    });
    room.status = "ENDED";
  }

  const liveKitOnline = isLiveKitConfigured();

  return (
    <SectionErrorBoundary title="Room">
    {/* Pinned above the room: live Versus battles relevant to what's
       playing. Listeners stay one tap away from voting without leaving
       the room context. Renders nothing if no active battles match. */}
    <RoomBattleStrip
      roomId={room.id}
      currentSongId={room.currentSong?.id ?? null}
      currentSongArtist={room.currentSong?.artist ?? null}
      currentSongGenre={room.currentSong?.genre ?? null}
    />
    <RoomClient
      room={{
        id: room.id,
        title: room.title,
        description: room.description,
        status: room.status,
        hostId: room.hostId,
        host: room.host,
        currentSong: room.currentSong
          ? {
              id: room.currentSong.id,
              title: room.currentSong.title,
              artist: room.currentSong.artist,
              coverUrl: room.currentSong.coverUrl,
              audioUrl: room.currentSong.audioUrl,
              licensePrice: room.currentSong.licensePrice.toString(),
              soldLicenses: room.currentSong.soldLicenses,
              totalLicenses: room.currentSong.totalLicenses,
            }
          : null,
      }}
      currentUserId={session.user.id}
      liveKitOnline={liveKitOnline}
    />
    </SectionErrorBoundary>
  );
}
