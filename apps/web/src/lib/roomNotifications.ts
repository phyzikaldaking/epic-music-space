import { prisma } from "@/lib/prisma";
import { enqueueNotification } from "@/lib/queues";

/**
 * Notify all of a host's followers that they've opened a live listening
 * session. Fires-and-forgets — never blocks room creation on notification
 * fan-out failure.
 */
export async function notifyFollowersOfNewRoom({
  roomId,
  hostId,
  hostName,
  title,
}: {
  roomId: string;
  hostId: string;
  hostName: string;
  title: string;
}): Promise<void> {
  try {
    const followers = await prisma.userFollow.findMany({
      where: { followingId: hostId },
      select: { followerId: true },
      take: 5_000,
    });

    if (followers.length === 0) return;

    await Promise.allSettled(
      followers.map((f) =>
        enqueueNotification({
          userId: f.followerId,
          type: "ROOM_LIVE",
          title: `${hostName} just went live`,
          body: `"${title}" — drop into the listening session.`,
          metadata: { roomId, hostId },
        }),
      ),
    );
  } catch (err) {
    console.warn("[notifyFollowersOfNewRoom]", err);
  }
}
