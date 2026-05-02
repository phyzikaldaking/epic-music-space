import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/email";
import { randomBytes } from "crypto";
import { strictLimiter } from "@/lib/rateLimit";
import { emitAuthEvent } from "@/lib/authObservability";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  try {
    await strictLimiter.consume(`resend-verify:${ip}`);
  } catch {
    await emitAuthEvent("resend_rate_limited", { ip, retryAfterSeconds: 60 });
    return NextResponse.json(
      {
        error: "Too many requests. Please wait before trying again.",
        retryAfterSeconds: 60,
      },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : null;
  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, emailVerified: true, passwordHash: true },
  });

  // Always respond OK to avoid email enumeration
  if (!user || !user.passwordHash || user.emailVerified) {
    return NextResponse.json({ ok: true });
  }

  // Delete any existing tokens for this email
  await prisma.verificationToken.deleteMany({ where: { identifier: email } });

  const token = randomBytes(32).toString("hex");
  await prisma.verificationToken.create({
    data: {
      identifier: email,
      token,
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  const sent = await sendVerificationEmail(email, token);

  if (!sent.ok) {
    await emitAuthEvent("resend_email_send_failed", {
      ip,
      email,
      userId: user.id,
      providerError:
        typeof sent.error === "object" && sent.error !== null
          ? JSON.stringify(sent.error)
          : String(sent.error ?? "unknown"),
    });

    return NextResponse.json(
      {
        error:
          "Verification email could not be sent right now. Please try again shortly and check your spam folder.",
      },
      { status: 503 },
    );
  }

  await emitAuthEvent("resend_accepted", {
    ip,
    email,
    userId: user.id,
  });

  return NextResponse.json({ ok: true });
}
