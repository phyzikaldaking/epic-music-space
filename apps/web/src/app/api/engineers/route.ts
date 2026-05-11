import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// GET /api/engineers — public discovery feed. Lists verified engineer
// profiles, each with their active ENGINEER_* listings inlined so the
// /engineers grid can render cards in a single round trip.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const specialty = url.searchParams.get("specialty");
  const kind = url.searchParams.get("kind"); // optional ENGINEER_MIX | ENGINEER_MASTER

  const profiles = await prisma.engineerProfile.findMany({
    where: {
      verifiedAt: { not: null },
      isAcceptingWork: true,
      ...(specialty ? { specialties: { has: specialty } } : {}),
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          image: true,
          headline: true,
          coverImage: true,
          isVerified: true,
          grammyNominations: true,
          grammyWins: true,
          riaaPlatinum: true,
          yearsExperience: true,
          verseListings: {
            where: {
              status: "ACTIVE",
              kind:
                kind === "ENGINEER_MIX" || kind === "ENGINEER_MASTER"
                  ? kind
                  : { in: ["ENGINEER_MIX", "ENGINEER_MASTER"] },
            },
            select: {
              id: true,
              kind: true,
              title: true,
              priceUsd: true,
              sessionMinutes: true,
              deliveryDays: true,
              tags: true,
            },
            take: 6,
          },
        },
      },
    },
    orderBy: { verifiedAt: "desc" },
    take: 60,
  });

  // Drop profiles that have zero active engineer listings — the
  // discovery page is a marketplace, not a directory.
  const cards = profiles.filter((p) => p.user.verseListings.length > 0);

  return NextResponse.json({ engineers: cards });
}
