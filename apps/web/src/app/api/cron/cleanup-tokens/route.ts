import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * POST /api/cron/cleanup-tokens
 * Authorization: Bearer <CRON_SECRET>
 *
 * Deletes expired VerificationToken and PasswordResetToken rows.
 * Run nightly — e.g., via Vercel Cron at "0 3 * * *".
 *
 * Set CRON_SECRET to a long random string and pass it as the Authorization
 * header so only the scheduler can trigger this endpoint.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();

  const [vt, pr] = await Promise.all([
    prisma.verificationToken.deleteMany({ where: { expires: { lt: now } } }),
    prisma.passwordResetToken.deleteMany({ where: { expires: { lt: now } } }),
  ]);

  return NextResponse.json({
    ok: true,
    deletedVerificationTokens: vt.count,
    deletedPasswordResetTokens: pr.count,
    cleanedAt: now.toISOString(),
  });
}
