import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRequestId, jsonWithRequestId } from "@/lib/requestTracing";

/**
 * Get battle leaderboard with vote counts
 * GET /api/studio/battles/[battleId]/leaderboard
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getRequestId(req);

  try {
    const { id: battleId } = await params;

    if (!battleId) {
      return jsonWithRequestId(
        requestId,
        { error: "Battle ID required" },
        { status: 400 }
      );
    }

    const entries = await prisma.battleEntry.findMany({
      where: { sessionId: battleId },
      orderBy: { votes: "desc" },
      take: 20,
    });

    const leaderboard = entries.map((entry, idx) => ({
      rank: idx + 1,
      entryId: entry.id,
      producerId: entry.userId,
      votes: entry.votes,
      duration: entry.duration,
    }));

    const totalVotes = entries.reduce((sum, e) => sum + e.votes, 0);

    return jsonWithRequestId(
      requestId,
      {
        entries: leaderboard,
        totalVotes,
        battleId,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[studio/battles/leaderboard]", err);
    return jsonWithRequestId(
      requestId,
      { error: err instanceof Error ? err.message : "Leaderboard fetch failed" },
      { status: 500 }
    );
  }
}
