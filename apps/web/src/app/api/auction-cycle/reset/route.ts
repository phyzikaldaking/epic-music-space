import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuctionCycle } from "@/lib/auctionCycle";
import { CHANNELS, createServerSupabaseClient } from "@/lib/supabase";
import { enqueueNotification } from "@/lib/queues";
import { track } from "@/lib/analytics";
import { requireAdminOrCron } from "@/lib/routeAuth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const access = await requireAdminOrCron(req);
  if (!access.ok) return access.response;

  const cycle = getAuctionCycle();

  const winner = await prisma.song.findFirst({
    where: { isActive: true, boostScore: { gt: 0 } },
    orderBy: [{ boostScore: "desc" }, { aiScore: "desc" }],
    select: {
      id: true,
      title: true,
      artist: true,
      artistId: true,
      aiScore: true,
      boostScore: true,
    },
  });

  const result = await prisma.$transaction(async (tx) => {
    if (winner) {
      await tx.transaction.create({
        data: {
          userId: winner.artistId,
          songId: winner.id,
          amount: 0,
          type: "BOOST",
          status: "SUCCEEDED",
          metadata: {
            type: "AUCTION_CYCLE_WINNER",
            cycleId: cycle.cycleId,
            title: winner.title,
            artist: winner.artist,
            winningBoostScore: winner.boostScore,
            winningRankScore: winner.aiScore + winner.boostScore,
            reward: "champion_badge_next_cycle_visibility",
          },
        },
      });

      await enqueueNotification({
        userId: winner.artistId,
        type: "BOOST_ACTIVATED",
        title: "🏆 You won the EMS auction cycle",
        body: `"${winner.title}" dominated ${cycle.cycleId}. You earned champion visibility for the next round.`,
        metadata: { songId: winner.id, cycleId: cycle.cycleId, boostScore: winner.boostScore },
      });
    }

    const reset = await tx.song.updateMany({
      where: { boostScore: { gt: 0 } },
      data: { boostScore: 0 },
    });

    return { resetCount: reset.count };
  });

  const supabase = createServerSupabaseClient();
  if (supabase) {
    await supabase.channel(CHANNELS.leaderboard).send({
      type: "broadcast",
      event: "auction_cycle_reset",
      payload: {
        cycleId: cycle.cycleId,
        resetCount: result.resetCount,
        winner: winner
          ? {
              songId: winner.id,
              title: winner.title,
              artist: winner.artist,
              winningBoostScore: winner.boostScore,
              winningRankScore: winner.aiScore + winner.boostScore,
            }
          : null,
      },
    });
  }

  track({
    event: "auction_cycle_reset",
    properties: {
      cycleId: cycle.cycleId,
      resetCount: result.resetCount,
      winnerSongId: winner?.id,
      winnerBoostScore: winner?.boostScore,
    },
  });

  return NextResponse.json({
    success: true,
    message: winner ? "Auction cycle reset and winner archived" : "Auction cycle reset with no bids",
    cycleId: cycle.cycleId,
    resetCount: result.resetCount,
    winner: winner
      ? {
          songId: winner.id,
          title: winner.title,
          artist: winner.artist,
          winningBoostScore: winner.boostScore,
          winningRankScore: winner.aiScore + winner.boostScore,
        }
      : null,
  });
}
