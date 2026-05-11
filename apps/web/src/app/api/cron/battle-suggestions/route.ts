import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCronRequest } from "@/lib/routeAuth";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Nightly battle-suggestion cron (G40 in the 50-item audit). Pairs
 * artists who:
 *   - publish in the same district / genre area
 *   - have similar studio level (within ±1 tier)
 *   - haven't battled each other in the last 30 days
 *   - both have at least one active Song
 *
 * Writes one BattleSuggestion row per pair so an in-app notification
 * surface (or an email drip) can pick them up. Caps at 50 pairs per
 * run so we don't blast every artist at once on a fresh deploy.
 *
 * This is the back-end pump. The on-feed nudge UI and the
 * BattleSuggestion model wiring land in a follow-up — until then
 * the cron is a no-op that returns a friendly summary.
 */
export async function GET(req: NextRequest) {
  const access = requireCronRequest(req);
  if (!access.ok) return access.response;

  // We don't have a BattleSuggestion table yet (separate migration
  // when the nudge UI lands). For now, return a dry-run report so the
  // cron can be wired in Vercel without errors.
  const eligibleArtistCount = await prisma.user.count({
    where: {
      role: { in: ["ARTIST", "LABEL"] },
      songs: { some: { isActive: true, isDraft: false } },
    },
  });

  return NextResponse.json({
    ok: true,
    mode: "dry-run",
    eligibleArtistCount,
    message:
      "Battle-suggestion cron is wired. Add a BattleSuggestion table + nudge UI to start sending matches.",
  });
}
