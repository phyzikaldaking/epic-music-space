import { NextResponse } from "next/server";
import { getAuctionCycle } from "@/lib/auctionCycle";

export async function GET() {
  const cycle = getAuctionCycle();
  return NextResponse.json({
    cycleId: cycle.cycleId,
    cycleNumber: cycle.cycleNumber,
    startsAt: cycle.startsAt.toISOString(),
    endsAt: cycle.endsAt.toISOString(),
    msRemaining: cycle.msRemaining,
  });
}
