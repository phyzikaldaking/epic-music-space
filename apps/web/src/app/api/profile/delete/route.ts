import { NextResponse } from "next/server";
import { compare as bcryptCompare } from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimitInline";

export const runtime = "nodejs";

/**
 * GDPR / CCPA-compliant account deletion. Self-service.
 *
 * Required body: { confirm: "DELETE", password?: string }
 *
 * - Password is checked when the account has one. OAuth-only accounts skip
 *   it (the session cookie was already a valid auth proof).
 * - Cascading deletes via Prisma onDelete: Cascade clean up Studios, Songs,
 *   Licenses, Transactions, RoomParticipants, etc.
 * - We KEEP transactions / payouts / revenue events for 7 years (legal
 *   record-keeping) by anonymizing user instead of hard-deleting when there
 *   are active payouts in the last 90 days.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await rateLimit("strict", `account-delete:${session.user.id}`);
  if (blocked) return blocked;

  const body = (await req.json().catch(() => ({}))) as {
    confirm?: string;
    password?: string;
  };
  if (body.confirm !== "DELETE") {
    return NextResponse.json({ error: "Type DELETE to confirm." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, passwordHash: true },
  });
  if (!user) return NextResponse.json({ ok: true });

  if (user.passwordHash) {
    if (!body.password) {
      return NextResponse.json({ error: "Password required to confirm." }, { status: 400 });
    }
    const ok = await bcryptCompare(body.password, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "Wrong password." }, { status: 403 });
    }
  }

  // If the user has recent paid revenue activity, anonymize (preserves
  // financial audit trail) instead of hard-deleting.
  const recentPayout = await prisma.payout.findFirst({
    where: {
      userId: user.id,
      status: "PAID",
      paidAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
    },
    select: { id: true },
  });

  if (recentPayout) {
    const anonEmail = `deleted-${user.id}@deleted.epicmusicspace.local`;
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          email: anonEmail,
          name: "Deleted user",
          username: null,
          image: null,
          passwordHash: null,
          stripeCustomerId: null,
          stripeConnectId: null,
          // Keep payouts / revenueSplits intact for accounting.
        },
      }),
      prisma.session.deleteMany({ where: { userId: user.id } }),
      prisma.account.deleteMany({ where: { userId: user.id } }),
    ]);
    return NextResponse.json({ ok: true, mode: "anonymized" });
  }

  // No recent financial activity — hard delete (cascades take care of
  // Studio, Songs, Licenses, RoomParticipants, etc.).
  await prisma.user.delete({ where: { id: user.id } });

  return NextResponse.json({ ok: true, mode: "deleted" });
}
