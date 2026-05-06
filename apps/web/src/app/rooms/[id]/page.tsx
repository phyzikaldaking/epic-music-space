import { notFound, redirect } from "next/navigation";
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
  if (!session?.user?.id) {
    redirect(`/auth/signin?callbackUrl=/rooms/${id}`);
  }

  const room = await prisma.room.findUnique({
    where: { id },
    include: {
      host: { select: { id: true, name: true, image: true, username: true, subscriptionTier: true } },
      currentSong: {
        select: { id: true, title: true, artist: true, genre: true, coverUrl: true, audioUrl: true, licensePrice: true, soldLicenses: true, totalLicenses: true },
      },
    },
  });
  if (!room) notFound();

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
