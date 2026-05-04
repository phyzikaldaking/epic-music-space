import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_PAGE = 100;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(MAX_PAGE, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
  const cursor = url.searchParams.get("cursor");

  const licenses = await prisma.licenseToken.findMany({
    where: {
      holderId: session.user.id,
      status: "ACTIVE",
    },
    select: {
      id: true,
      tokenNumber: true,
      purchasedAt: true,
      price: true,
      song: {
        select: {
          id: true,
          title: true,
          artist: true,
          audioUrl: true,
          coverUrl: true,
          licensePrice: true,
          aiScore: true,
          boostScore: true,
        },
      },
      transactions: {
        select: { id: true, amount: true, type: true, status: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 3,
      },
    },
    orderBy: { purchasedAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  let nextCursor: string | null = null;
  if (licenses.length > limit) {
    const last = licenses.pop()!;
    nextCursor = last.id;
  }

  return NextResponse.json({
    licenses: licenses.map((license) => ({
      id: license.id,
      tokenNumber: license.tokenNumber,
      purchasedAt: license.purchasedAt,
      price: Number(license.price),
      song: {
        ...license.song,
        licensePrice: Number(license.song.licensePrice),
      },
      recentTransactions: license.transactions.map((tx) => ({
        ...tx,
        amount: Number(tx.amount),
      })),
    })),
    nextCursor,
  });
}
