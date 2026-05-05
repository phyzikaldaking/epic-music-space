import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { strictLimiter } from "@/lib/rateLimit";
import { sendPasswordResetEmail } from "@/lib/email";

export const runtime = "nodejs";

const bodySchema = z.object({ email: z.string().email() });

/**
 * POST /api/auth/forgot-password — request a password reset link.
 *
 * Always returns 200 with the same shape regardless of whether the email
 * exists, so the endpoint can't be used as an account-enumeration oracle.
 * The actual email is only sent for accounts that exist.
 */
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await strictLimiter.consume(`forgot-password:${ip}`);
  } catch {
    return NextResponse.json({ ok: true });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: true });

  const email = parsed.data.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  // Always return 200 — never tell the caller whether the email is registered.
  if (!user) return NextResponse.json({ ok: true });

  // 32-byte token, hex-encoded → 64 chars in the email link. We store only
  // the sha256 hash so a DB leak doesn't yield usable reset tokens.
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expires = new Date(Date.now() + 30 * 60 * 1000); // 30 min

  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expires },
  });

  try {
    await sendPasswordResetEmail(email, rawToken);
  } catch (err) {
    console.error("[forgot-password] email send failed", err);
  }

  return NextResponse.json({ ok: true });
}
