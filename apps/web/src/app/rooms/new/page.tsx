import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRoomLimitsForTier } from "@/lib/roomTier";
import { isLiveKitConfigured } from "@/lib/livekit";
import NewRoomForm from "./NewRoomForm";

export const metadata = {
  title: "Host a Listening Session — Epic Music Space",
  description:
    "Open a live audio room. Press play on your album, talk between tracks, and welcome fans into the same room as you.",
};

export default async function NewRoomPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signup?role=ARTIST&callbackUrl=%2Fstudio%2Fsetup%3Fnext%3D%2Frooms%2Fnew");
  }

  const [user, songs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { subscriptionTier: true },
    }),
    prisma.song.findMany({
      where: { artistId: session.user.id, isActive: true },
      select: { id: true, title: true, artist: true, coverUrl: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ]);

  const limits = getRoomLimitsForTier(user?.subscriptionTier ?? "FREE");
  const liveKitOnline = isLiveKitConfigured();

  return (
    <NewRoomForm
      limits={limits}
      tier={user?.subscriptionTier ?? "FREE"}
      songs={songs}
      liveKitOnline={liveKitOnline}
    />
  );
}
