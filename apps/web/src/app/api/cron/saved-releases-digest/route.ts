import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCronRequest } from "@/lib/routeAuth";
import { sendSavedReleasesDigestEmail } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 300;

const BATCH = 200;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Weekly digest for listeners with new drops from artists they saved.
 *
 * Source of truth is SAVED_ARTIST_DROP notifications generated at drop time.
 * This keeps digest composition lightweight and channel-consistent with
 * /notifications + push fanout.
 */
export async function GET(req: NextRequest) {
  const access = requireCronRequest(req);
  if (!access.ok) return access.response;

  const since = new Date(Date.now() - SEVEN_DAYS_MS);

  const recipientRows = await prisma.notification.findMany({
    where: {
      type: "SAVED_ARTIST_DROP",
      createdAt: { gte: since },
    },
    select: { userId: true },
    distinct: ["userId"],
    take: BATCH,
  });

  if (recipientRows.length === 0) {
    return NextResponse.json({ processed: 0, sent: 0, skipped: 0, failed: 0 });
  }

  const users = await prisma.user.findMany({
    where: {
      id: { in: recipientRows.map((r) => r.userId) },
      emailVerified: { not: null },
      emailBounced: false,
    },
    select: { id: true, email: true, name: true },
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of users) {
    if (!user.email) {
      skipped += 1;
      continue;
    }

    const pref = await prisma.notificationPreference.findUnique({
      where: {
        userId_type: {
          userId: user.id,
          type: "SAVED_RELEASES_DIGEST",
        },
      },
      select: { email: true },
    });
    if (pref?.email === false) {
      skipped += 1;
      continue;
    }

    const notifications = await prisma.notification.findMany({
      where: {
        userId: user.id,
        type: "SAVED_ARTIST_DROP",
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        metadata: true,
      },
    });

    const uniq = new Map<string, { songId: string; songTitle: string; artistName: string }>();
    for (const n of notifications) {
      const metadata = (n.metadata ?? {}) as Record<string, unknown>;
      const songId = typeof metadata.songId === "string" ? metadata.songId : null;
      const songTitle = typeof metadata.songTitle === "string" ? metadata.songTitle : null;
      const artistName = typeof metadata.artistName === "string" ? metadata.artistName : null;
      if (!songId || !songTitle || !artistName) continue;
      if (!uniq.has(songId)) uniq.set(songId, { songId, songTitle, artistName });
    }

    const items = Array.from(uniq.values());
    if (items.length === 0) {
      skipped += 1;
      continue;
    }

    try {
      const result = await sendSavedReleasesDigestEmail({
        to: user.email,
        listenerName: user.name ?? "there",
        items,
      });
      if (result.ok) sent += 1;
      else failed += 1;
    } catch (err) {
      console.error("[saved-releases-digest] send failed", { userId: user.id, err });
      failed += 1;
    }
  }

  return NextResponse.json({
    processed: users.length,
    sent,
    skipped,
    failed,
    since: since.toISOString(),
  });
}
