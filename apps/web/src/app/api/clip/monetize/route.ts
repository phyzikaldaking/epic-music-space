import { NextResponse } from "next/server";
import { calculateClipRevenueSplit, getDefaultRevenueForEvent, buildClipRevenueSummary } from "@/lib/clipRevenue";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.clipId || !body?.source) {
    return NextResponse.json({ error: "Missing monetization data" }, { status: 400 });
  }

  const grossRevenue = getDefaultRevenueForEvent(body.source, body.grossRevenue);

  const split = calculateClipRevenueSplit({
    clipId: body.clipId,
    songId: body.songId,
    artistId: body.artistId,
    creatorId: body.creatorId,
    grossRevenue,
    source: body.source,
  });

  const summary = buildClipRevenueSummary(split);

  return NextResponse.json({
    status: "ok",
    split,
    summary,
  });
}
