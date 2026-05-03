import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const licenses = await prisma.licenseToken.findMany({
    where: {
      holderId: session.user.id,
      status: "ACTIVE",
    },
    include: {
      song: true,
      transactions: {
        orderBy: { createdAt: "desc" },
        take: 3,
      },
    },
    orderBy: { purchasedAt: "desc" },
  });

  return NextResponse.json({
    licenses: licenses.map((license) => ({
      id: license.id,
      tokenNumber: license.tokenNumber,
      purchasedAt: license.purchasedAt,
      price: Number(license.price),
      song: {
        id: license.song.id,
        title: license.song.title,
        artist: license.song.artist,
        audioUrl: license.song.audioUrl,
        coverUrl: license.song.coverUrl,
        licensePrice: Number(license.song.licensePrice),
        aiScore: license.song.aiScore,
        boostScore: license.song.boostScore,
      },
      recentTransactions: license.transactions.map((tx) => ({
        id: tx.id,
        amount: Number(tx.amount),
        type: tx.type,
        status: tx.status,
        createdAt: tx.createdAt,
      })),
    })),
  });
}
