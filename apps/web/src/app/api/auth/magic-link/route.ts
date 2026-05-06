import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { strictLimiter } from "@/lib/rateLimit";
import { emitAuthEvent } from "@/lib/authObservability";
import { getClientIp, hashAuthToken, normalizeEmail } from "@/lib/authIdentity";
import { sendMagicLinkEmail } from "@/lib/email";

const requestSchema = z.object({
  email: z.string().email(),
  callbackUrl: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);

  try {
    await strictLimiter.consume(`magic-link:request:ip:${ip}`);
  } catch {
    return NextResponse.json(
      { error: "Too many requests. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const body = (await req.json().catch(() => ({}))) as unknown;
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const { email, callbackUrl } = parsed.data;
  const normalizedEmail = normalizeEmail(email);

  // Rate-limit per-email to prevent enumeration/abuse
  try {
    await strictLimiter.consume(`magic-link:request:email:${normalizedEmail}`);
  } catch {
    return NextResponse.json(
      { error: "Too many requests for this email. Try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  // Check if account exists (for observability only — always return success to prevent email enumeration)
  const existingUser = await prisma.user.findFirst({
    where: { email: { equals: normalizedEmail, mode: "insensitive" } },
    select: { id: true, isSuspended: true },
  });

  if (!existingUser) {
    await emitAuthEvent("magic_link_skipped", {
      ip,
      email: normalizedEmail,
      reason: "no_account",
    });
    // Still return ok to avoid leaking account existence
    return NextResponse.json({ ok: true });
  }

  if (existingUser.isSuspended) {
    await emitAuthEvent("magic_link_skipped", {
      ip,
      email: normalizedEmail,
      userId: existingUser.id,
      reason: "suspended_user",
    });
    return NextResponse.json({ ok: true });
  }

  // Generate single-use token
  const token = randomBytes(32).toString("hex");
  const hashedToken = hashAuthToken(token);
  const identifier = `magic:${normalizedEmail}`;

  // Remove any existing tokens for this identifier
  await prisma.verificationToken.deleteMany({ where: { identifier } });

  // Create new token (15 minute expiry)
  await prisma.verificationToken.create({
    data: {
      identifier,
      token: hashedToken,
      expires: new Date(Date.now() + 15 * 60 * 1000),
    },
  });

  // Send email
  const emailResult = await sendMagicLinkEmail(normalizedEmail, token, callbackUrl || undefined);

  if (!emailResult.ok) {
    await emitAuthEvent("magic_link_send_failed", {
      ip,
      email: normalizedEmail,
      userId: existingUser.id,
      providerError: typeof emailResult.error === "object" ? JSON.stringify(emailResult.error) : String(emailResult.error ?? "unknown"),
    });
    // Don't fail the request — the token is still valid and the user can request another link
  } else {
    await emitAuthEvent("magic_link_sent", {
      ip,
      email: normalizedEmail,
      userId: existingUser.id,
    });
  }

  return NextResponse.json({ ok: true });
}
