import { prisma } from "@/lib/prisma";
import { enqueueNotification } from "@/lib/queues";
import { getSiteUrl } from "@/lib/site";

const SAVED_DROP_TYPE = "SAVED_ARTIST_DROP";

function isSongPublicNow(song: {
  isActive: boolean;
  isDraft: boolean;
  scheduledAt: Date | null;
}) {
  if (!song.isActive || song.isDraft) return false;
  if (!song.scheduledAt) return true;
  return song.scheduledAt.getTime() <= Date.now();
}

/**
 * Notify users who saved tracks from this artist that a new public track dropped.
 * Dedupe key is (userId, type=SAVED_ARTIST_DROP, metadata.songId) so retries/crons are idempotent.
 */
export async function fanoutSavedArtistDrop(songId: string) {
  const song = await prisma.song.findUnique({
    where: { id: songId },
    select: {
      id: true,
      title: true,
      artist: true,
      artistId: true,
      isActive: true,
      isDraft: true,
      scheduledAt: true,
      coverUrl: true,
    },
  });
  if (!song || !isSongPublicNow(song)) {
    return { processed: 0, queued: 0, skipped: "not-public" as const };
  }

  const artistSongs = await prisma.song.findMany({
    where: { artistId: song.artistId },
    select: { id: true },
  });
  if (artistSongs.length === 0) {
    return { processed: 0, queued: 0, skipped: "no-artist-catalog" as const };
  }

  const savedRows = await prisma.savedTrack.findMany({
    where: { songId: { in: artistSongs.map((s) => s.id) } },
    select: { userId: true },
    distinct: ["userId"],
  });
  const recipients = savedRows
    .map((r) => r.userId)
    .filter((userId) => userId !== song.artistId);
  if (recipients.length === 0) {
    return { processed: 0, queued: 0, skipped: "no-recipients" as const };
  }

  const existing = await prisma.notification.findMany({
    where: {
      userId: { in: recipients },
      type: SAVED_DROP_TYPE,
      metadata: { path: ["songId"], equals: song.id },
    },
    select: { userId: true },
    distinct: ["userId"],
  });
  const alreadySent = new Set(existing.map((n) => n.userId));
  const freshRecipients = recipients.filter((userId) => !alreadySent.has(userId));

  if (freshRecipients.length === 0) {
    return { processed: recipients.length, queued: 0, skipped: "already-sent" as const };
  }

  const base = getSiteUrl();
  const trackUrl = `${base}/track/${song.id}`;
  const title = `${song.artist} dropped a new track`;
  const body = `\"${song.title}\" is live now. Tap to preview and save your spot.`;

  await Promise.allSettled(
    freshRecipients.map((userId) =>
      enqueueNotification({
        userId,
        type: SAVED_DROP_TYPE,
        title,
        body,
        metadata: {
          songId: song.id,
          songTitle: song.title,
          artistId: song.artistId,
          artistName: song.artist,
          coverUrl: song.coverUrl ?? null,
          source: "saved-track",
        },
        email: {
          subject: `${song.artist} just dropped \"${song.title}\"`,
          html: `<!DOCTYPE html><html><body style="background:#0a0a0a;color:#fff;font-family:-apple-system,sans-serif;padding:28px 16px"><div style="max-width:560px;margin:0 auto;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:18px;padding:28px 24px"><p style="margin:0 0 8px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#a78bfa">Saved artist alert</p><h1 style="margin:0 0 12px;font-size:22px;line-height:1.25">${escapeHtml(song.artist)} just dropped a new track</h1><p style="margin:0 0 16px;color:rgba(255,255,255,0.74);line-height:1.6">\"${escapeHtml(song.title)}\" is now live on Epic Music Space.</p><p style="margin:18px 0"><a href="${trackUrl}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:700">Listen now →</a></p><p style="margin:0;font-size:12px;color:rgba(255,255,255,0.45)">You're getting this because you've saved tracks by ${escapeHtml(song.artist)}.</p></div></body></html>`,
          text: `${song.artist} just dropped \"${song.title}\" on Epic Music Space: ${trackUrl}`,
        },
      }),
    ),
  );

  return { processed: recipients.length, queued: freshRecipients.length };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>\"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
