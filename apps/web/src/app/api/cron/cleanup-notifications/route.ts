import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCronRequest } from "@/lib/routeAuth";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Daily cleanup: prune notifications that have outlived their usefulness
 * so the table doesn't grow unbounded as the platform scales.
 *
 * Rules:
 *   - read   → drop after 30 days
 *   - unread → drop after 90 days (more lenient — user might still want
 *              the inbox to surface very old unread items, but past three
 *              months it's noise).
 */
export async function GET(req: NextRequest) {
  const access = requireCronRequest(req);
  if (!access.ok) return access.response;

  const now = Date.now();
  const readCutoff = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const unreadCutoff = new Date(now - 90 * 24 * 60 * 60 * 1000);

  const [readDel, unreadDel] = await Promise.all([
    prisma.notification.deleteMany({
      where: { read: true, createdAt: { lt: readCutoff } },
    }),
    prisma.notification.deleteMany({
      where: { read: false, createdAt: { lt: unreadCutoff } },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    deletedRead: readDel.count,
    deletedUnread: unreadDel.count,
    readCutoff: readCutoff.toISOString(),
    unreadCutoff: unreadCutoff.toISOString(),
  });
}
