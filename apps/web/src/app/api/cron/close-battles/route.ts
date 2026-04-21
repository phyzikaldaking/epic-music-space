import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { finaliseMatch } from "@/app/api/versus/[id]/vote/route";

export const runtime = "nodejs";

/**
 * GET /api/cron/close-battles
 *
 * Vercel Cron job (runs every 10 minutes — see vercel.json).
 * Closes all ACTIVE versus matches whose endsAt has passed,
 * updates versusWins / versusLosses, and awards the
 * FIRST_BATTLE_WIN badge to each winning artist.
 *
 * Protected by the CRON_SECRET env var so it cannot be
 * triggered by arbitrary HTTP requests.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET
    ? `Bearer ${process.env.CRON_SECRET}`
    : null;

  // When CRON_SECRET is set (production) enforce it;
  // in local dev without the secret we still allow the call.
  if (expected && authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const expired = await prisma.versusMatch.findMany({
    where: { status: "ACTIVE", endsAt: { lt: now } },
    select: { id: true, songAId: true, songBId: true, votesA: true, votesB: true },
  });

  if (expired.length === 0) {
    return NextResponse.json({ closed: 0 });
  }

  let closed = 0;
  const errors: string[] = [];

  for (const match of expired) {
    try {
      await finaliseMatch(match.id, match.songAId, match.songBId, match.votesA, match.votesB);
      closed++;
    } catch (err) {
      console.error(`[cron/close-battles] Failed to finalise match ${match.id}:`, err);
      errors.push(match.id);
    }
  }

  console.log(`[cron/close-battles] Closed ${closed}/${expired.length} matches`);
  return NextResponse.json({ closed, errors: errors.length ? errors : undefined });
}
