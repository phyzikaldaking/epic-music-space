import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendNotificationEmail } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ATTEMPTS = 4;

/**
 * Flushes pending EmailOutbox rows that weren't confirmed sent.
 * Called by Vercel Cron every 5 minutes. Requires Bearer CRON_SECRET.
 *
 * Idempotent: rows are only retried when status=PENDING and attempts < MAX_ATTEMPTS.
 * SUPPRESSED rows (bounced recipients) are never retried.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pending = await prisma.emailOutbox.findMany({
    where: {
      status: "PENDING",
      attempts: { lt: MAX_ATTEMPTS },
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  let sent = 0;
  let failed = 0;
  let suppressed = 0;

  for (const row of pending) {
    // Check if recipient has since bounced
    if (row.userId) {
      const user = await prisma.user.findUnique({
        where: { id: row.userId },
        select: { emailBounced: true },
      });
      if (user?.emailBounced) {
        await prisma.emailOutbox.update({
          where: { id: row.id },
          data: { status: "SUPPRESSED" },
        });
        suppressed += 1;
        continue;
      }
    }

    try {
      await sendNotificationEmail({
        to: row.to,
        subject: row.subject,
        html: row.html,
        text: row.text ?? undefined,
      });

      await prisma.emailOutbox.update({
        where: { id: row.id },
        data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 } },
      });

      sent += 1;
    } catch (err) {
      const lastError = err instanceof Error ? err.message : "unknown";
      const newAttempts = row.attempts + 1;

      await prisma.emailOutbox.update({
        where: { id: row.id },
        data: {
          attempts: newAttempts,
          lastError,
          status: newAttempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
        },
      });

      failed += 1;
    }
  }

  return NextResponse.json({ sent, failed, suppressed, total: pending.length });
}
