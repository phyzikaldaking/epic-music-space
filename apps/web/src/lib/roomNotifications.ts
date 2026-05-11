import { prisma } from "@/lib/prisma";
import { enqueueNotification } from "@/lib/queues";

/**
 * Notify all of a host's followers that they've opened a live room.
 * `kind` distinguishes a generic listening party from a Clubhouse-style
 * "studio session" (producer + stage seats editing live) — the
 * notification copy + click-target both depend on it.
 *
 * Fires-and-forgets — never blocks room creation on notification
 * fan-out failure.
 */
export async function notifyFollowersOfNewRoom({
  roomId,
  hostId,
  hostName,
  title,
  kind = "listen_party",
}: {
  roomId: string;
  hostId: string;
  hostName: string;
  title: string;
  kind?: "listen_party" | "studio_session";
}): Promise<void> {
  try {
    const followers = await prisma.userFollow.findMany({
      where: { followingId: hostId },
      select: { followerId: true },
      take: 5_000,
    });

    if (followers.length === 0) return;

    const isStudio = kind === "studio_session";
    // Studio sessions deep-link straight into the stage-and-audience
    // view; listen parties keep the legacy /rooms/[id] target. The
    // notification client renders the link from `metadata.path`.
    const path = isStudio ? `/studio/live/edit/${roomId}` : `/rooms/${roomId}`;
    const notifType = isStudio ? "ROOM_LIVE_STUDIO" : "ROOM_LIVE";
    const titleCopy = isStudio
      ? `🎛️ ${hostName} is producing live`
      : `${hostName} just went live`;
    const bodyCopy = isStudio
      ? `"${title}" — drop in as audience, throw money on stage, or raise your hand to collab.`
      : `"${title}" — drop into the listening session.`;

    await Promise.allSettled(
      followers.map((f) =>
        enqueueNotification({
          userId: f.followerId,
          type: notifType,
          title: titleCopy,
          body: bodyCopy,
          metadata: { roomId, hostId, path },
        }),
      ),
    );
  } catch (err) {
    console.warn("[notifyFollowersOfNewRoom]", err);
  }
}
