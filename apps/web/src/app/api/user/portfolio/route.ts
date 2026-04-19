import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lenientLimiter } from "@/lib/rateLimit";

/**
 * GET /api/user/portfolio
 *
 * Returns the authenticated user's music portfolio:
 *   - licenses:     active license tokens with song details
 *   - transactions: recent completed purchase history (last 50)
 *   - summary:      total invested, number of licenses held, distinct songs
 *
 * Auth: required.
 */
export async function GET(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  try {
    await lenientLimiter.consume(ip);
  } catch {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [licenses, transactions] = await Promise.all([
    prisma.licenseToken.findMany({
      where: { holderId: session.user.id, status: "ACTIVE" },
      include: {
        song: {
          select: {
            id: true,
            title: true,
            artist: true,
            genre: true,
            coverUrl: true,
            licensePrice: true,
            revenueSharePct: true,
            totalLicenses: true,
            soldLicenses: true,
            aiScore: true,
            streamCount: true,
          },
        },
      },
      orderBy: { purchasedAt: "desc" },
    }),
    prisma.transaction.findMany({
      where: {
        userId: session.user.id,
        status: "SUCCEEDED",
        type: "LICENSE_PURCHASE",
      },
      include: {
        song: {
          select: { id: true, title: true, artist: true, coverUrl: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  // Aggregate portfolio summary
  const totalInvested = transactions.reduce(
    (sum, t) => sum + Number(t.amount),
    0
  );

  const portfolio = licenses.map((l) => ({
    licenseId: l.id,
    tokenNumber: l.tokenNumber,
    status: l.status,
    purchasedAt: l.purchasedAt,
    pricePaid: Number(l.price),
    song: {
      ...l.song,
      licensePrice: Number(l.song.licensePrice),
      revenueSharePct: Number(l.song.revenueSharePct),
      // Per-license revenue share = song's total share divided by total licenses
      perLicenseSharePct:
        Number(l.song.revenueSharePct) / l.song.totalLicenses,
    },
  }));

  const summary = {
    licensesHeld: licenses.length,
    distinctSongs: new Set(licenses.map((l) => l.songId)).size,
    totalInvested,
  };

  return NextResponse.json({ summary, portfolio, transactions });
}
