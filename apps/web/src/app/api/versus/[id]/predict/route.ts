import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveFanPick, getFanPick } from "@/lib/fanPredictions";
import { awardFanWeeklyPoints } from "@/lib/weeklyseason";

export const runtime = "nodejs";

const BodySchema = z.object({ side: z.enum(["A", "B"]) });

// ─── GET — fetch the caller's current pick ────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ pick: null });
  }
  const { id: matchId } = await params;
  const pick = await getFanPick(matchId, session.user.id);
  return NextResponse.json({ pick });
}

// ─── POST — lock in a pre-match prediction ───────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "side must be 'A' or 'B'" }, { status: 400 });
  }

  const { id: matchId } = await params;

  const match = await prisma.versusMatch.findUnique({
    where: { id: matchId },
    select: { status: true },
  });
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  if (match.status !== "ACTIVE") {
    return NextResponse.json({ error: "Match is no longer accepting picks" }, { status: 409 });
  }

  // Check for an existing pick — returns conflict instead of overwriting
  const existing = await getFanPick(matchId, session.user.id);
  if (existing !== null) {
    return NextResponse.json(
      { error: "Pick already locked in", pick: existing },
      { status: 409 },
    );
  }

  const saved = await saveFanPick(matchId, session.user.id, parsed.data.side);
  if (!saved) {
    // saveFanPick returned false — race condition, another request beat us
    return NextResponse.json({ error: "Pick already locked in" }, { status: 409 });
  }

  // Award 3 fan points for engaging with the pick'em system
  await awardFanWeeklyPoints(session.user.id, 3).catch(() => null);

  return NextResponse.json({ ok: true, pick: parsed.data.side }, { status: 201 });
}
