import { NextResponse } from "next/server";
import { getAuctionCycle } from "@/lib/auctionCycle";

// NOTE: Replace with real DB reset logic (Supabase / Prisma)
export async function POST() {
  const cycle = getAuctionCycle();

  console.log("RESETTING AUCTION CYCLE:", cycle.cycleId);

  // TODO:
  // 1. Reset boostScore for all songs
  // 2. Archive previous cycle results
  // 3. Store winner

  return NextResponse.json({
    success: true,
    message: "Auction cycle reset triggered",
    cycleId: cycle.cycleId,
  });
}
