import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * GET /api/purchases/list
 *
 * Returns the authenticated user's license purchases (LicenseTokens) and
 * their associated transaction records, paginated.
 *
 * Query params:
 *   page  — page number (default 1)
 *   limit — items per page (default 20, max 100)
 *
 * Auth: required.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    page: searchParams.get("page") ?? 1,
    limit: searchParams.get("limit") ?? 20,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid query params" },
      { status: 400 }
    );
  }

  const { page, limit } = parsed.data;
  const skip = (page - 1) * limit;

  try {
    const [licenses, total] = await Promise.all([
      prisma.licenseToken.findMany({
        where: { holderId: session.user.id },
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
              isActive: true,
            },
          },
          transactions: {
            select: {
              id: true,
              amount: true,
              status: true,
              type: true,
              createdAt: true,
              stripeSessionId: true,
            },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: { purchasedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.licenseToken.count({ where: { holderId: session.user.id } }),
    ]);

    return NextResponse.json({
      data: licenses.map((l) => ({
        id: l.id,
        tokenNumber: l.tokenNumber,
        status: l.status,
        price: l.price,
        purchasedAt: l.purchasedAt,
        song: l.song,
        transaction: l.transactions[0] ?? null,
      })),
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("[purchases/list] Error fetching purchases:", err);
    return NextResponse.json(
      { error: "Failed to fetch purchases" },
      { status: 500 }
    );
  }
}
