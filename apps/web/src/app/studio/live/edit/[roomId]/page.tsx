import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRoomLimitsForTier } from "@/lib/roomTier";
import StageAndAudience from "./StageAndAudience";

export const metadata: Metadata = {
  title: "Studio session — live",
  description:
    "Producer + collaborators on stage, audience tuning in. Watch the beat take shape, react, throw money, vote on takes.",
};

// Clubhouse-style "stage + audience" view of a live studio session.
// Stage seats (HOST + SPEAKER) edit the Yjs doc; audience watches,
// reacts, tips, votes. The host can promote a raised-hand listener
// up to stage seat 2..stageLimit (tier-gated by roomTier.ts).
//
// We resolve the viewer's role server-side so the initial paint
// already knows whether to render the "Throw money" button vs. the
// "Tip received" celebration banner. Live updates ride on the
// Supabase room channel via the StageAndAudience client component.
export default async function LiveEditPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    // Force sign-in so reactions/tips/promotion are bound to a user.
    // We don't render the live page anonymously — it's a richer
    // experience than the legacy spectator and the engagement
    // signals are useful to the host.
    notFound();
  }

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: {
      id: true,
      title: true,
      hostId: true,
      status: true,
      stageLimit: true,
      maxCapacity: true,
      startedAt: true,
      studioProjectId: true,
      studioProject: { select: { id: true, name: true, bpm: true } },
      host: {
        select: {
          id: true,
          name: true,
          username: true,
          image: true,
          subscriptionTier: true,
        },
      },
      participants: {
        where: { leftAt: null },
        orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
        select: {
          userId: true,
          role: true,
          handRaised: true,
          joinedAt: true,
          user: { select: { id: true, name: true, username: true, image: true } },
        },
      },
    },
  });
  if (!room || room.status !== "LIVE") notFound();

  const tier = room.host.subscriptionTier;
  const limits = getRoomLimitsForTier(tier);
  const me = room.participants.find((p) => p.userId === session.user!.id);
  // If the viewer isn't yet a participant they land here as audience.
  // We don't auto-insert a RoomParticipant row server-side — the
  // client's `join` action does that to keep the join time accurate.
  const myRole = me?.role ?? "AUDIENCE_GUEST";

  const onStage = room.participants.filter(
    (p) => p.role === "HOST" || p.role === "SPEAKER",
  );
  const audience = room.participants.filter((p) => p.role === "LISTENER");
  const handRaises = audience.filter((p) => p.handRaised);

  return (
    <StageAndAudience
      roomId={room.id}
      roomTitle={room.title}
      hostId={room.hostId}
      stageLimit={room.stageLimit}
      audienceLimit={limits.maxCapacity}
      tierLabel={limits.label}
      studioProject={room.studioProject}
      viewer={{
        id: session.user.id,
        role: myRole,
      }}
      initialStage={onStage.map((p) => ({
        userId: p.userId,
        role: p.role as "HOST" | "SPEAKER",
        name: p.user.name ?? p.user.username ?? "guest",
        image: p.user.image ?? null,
      }))}
      initialAudience={audience.map((p) => ({
        userId: p.userId,
        name: p.user.name ?? p.user.username ?? "guest",
        image: p.user.image ?? null,
        handRaised: p.handRaised,
      }))}
      initialHandRaises={handRaises.map((p) => p.userId)}
    />
  );
}
