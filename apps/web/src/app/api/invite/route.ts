import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

function generateCode(): string {
  return randomBytes(5).toString("hex").toUpperCase();
}

/**
 * GET /api/invite
 * Returns the caller's personal invite code (creates one if none exists).
 * Also returns usage count and milestone progress.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Find or create invite code
  let invite = await prisma.inviteCode.findFirst({
    where: { createdById: userId },
    orderBy: { createdAt: "asc" },
  });

  if (!invite) {
    invite = await prisma.inviteCode.create({
      data: {
        code: generateCode(),
        createdById: userId,
      },
    });
  }

  // Count successful uses
  const usedCount = await prisma.inviteCode.count({
    where: { createdById: userId, usedById: { not: null } },
  });

  return NextResponse.json({
    code: invite.code,
    usedCount,
    milestones: {
      five:  usedCount >= 5,
      ten:   usedCount >= 10,
      fifty: usedCount >= 50,
    },
  });
}
