import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendDripEmail, type DripStep } from "@/lib/email";
import { requireCronRequest } from "@/lib/routeAuth";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Daily onboarding drip cron.
 *
 * For every user, send any drip step that:
 *   1. Their account age has crossed the step's day threshold,
 *   2. Has not already been sent (deduped via EmailDripSent unique constraint),
 *   3. The user's email is verified (don't email unverified accounts), and
 *   4. The step applies to their role (the day-3 payout reminder is artist-only).
 *
 * Scheduled hourly via vercel.json. Idempotent: re-running within the same
 * hour is a no-op because the unique (userId, step) prevents duplicates.
 */
const STEPS: { step: DripStep; afterHours: number; artistOnly: boolean }[] = [
  { step: "welcome_day_0", afterHours: 0,   artistOnly: false },
  { step: "tips_day_1",    afterHours: 24,  artistOnly: false },
  { step: "payout_day_3",  afterHours: 72,  artistOnly: true },
];

const BATCH_SIZE = 200;

export async function GET(req: NextRequest) {
  const access = requireCronRequest(req);
  if (!access.ok) return access.response;

  const now = Date.now();
  const stats: Record<string, { sent: number; skipped: number; failed: number }> = {};

  for (const { step, afterHours, artistOnly } of STEPS) {
    stats[step] = { sent: 0, skipped: 0, failed: 0 };

    const cutoff = new Date(now - afterHours * 60 * 60 * 1000);
    // Cap: don't drip-bomb people who signed up months ago (e.g. backfill).
    const earliest = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const candidates = await prisma.user.findMany({
      where: {
        createdAt: { lte: cutoff, gte: earliest },
        emailVerified: { not: null },
        ...(artistOnly ? { role: { not: "LISTENER" } } : {}),
      },
      select: { id: true, email: true, name: true, role: true },
      take: BATCH_SIZE,
    });

    for (const u of candidates) {
      if (!u.email) {
        stats[step].skipped += 1;
        continue;
      }

      // Idempotency: try to insert the marker first; if the unique constraint
      // fires we know we've already sent this step.
      try {
        await prisma.emailDripSent.create({
          data: { userId: u.id, step },
        });
      } catch {
        stats[step].skipped += 1;
        continue;
      }

      try {
        const result = await sendDripEmail({
          to: u.email,
          name: u.name ?? "there",
          step,
          isArtist: u.role !== "LISTENER",
        });
        if (result.ok) {
          stats[step].sent += 1;
        } else {
          stats[step].failed += 1;
          // Roll back the marker so the next pass can retry.
          await prisma.emailDripSent.deleteMany({
            where: { userId: u.id, step },
          });
        }
      } catch (err) {
        console.error("[email-drip] send threw", { userId: u.id, step, err });
        stats[step].failed += 1;
        await prisma.emailDripSent.deleteMany({
          where: { userId: u.id, step },
        });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    stats,
  });
}
