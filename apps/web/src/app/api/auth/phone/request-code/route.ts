import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { strictLimiter } from "@/lib/rateLimit";
import { emitAuthEvent } from "@/lib/authObservability";
import { getClientIp } from "@/lib/authIdentity";
import {
  createPhoneLoginCode,
  hashPhoneLoginCode,
  isPhoneAuthConfigured,
  normalizePhone,
  phoneLoginIdentifier,
  sendPhoneLoginCode,
} from "@/lib/phoneAuth";

const requestSchema = z.object({
  phone: z.string().min(8).max(32),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);

  if (!isPhoneAuthConfigured()) {
    return NextResponse.json(
      { error: "Phone sign-in is currently unavailable." },
      { status: 503 },
    );
  }

  try {
    await strictLimiter.consume(`phone-login:request:ip:${ip}`);
  } catch {
    return NextResponse.json(
      { error: "Too many code requests. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const body = (await req.json().catch(() => ({}))) as unknown;
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
  }

  const normalizedPhone = normalizePhone(parsed.data.phone);
  if (!normalizedPhone) {
    return NextResponse.json({ error: "Use international format like +15551234567." }, { status: 400 });
  }

  try {
    await strictLimiter.consume(`phone-login:request:phone:${normalizedPhone}`);
  } catch {
    return NextResponse.json(
      { error: "Too many code requests for this number. Try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const linkedAccount = await prisma.connectedAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: "phone",
        providerAccountId: normalizedPhone,
      },
    },
    select: {
      userId: true,
      user: {
        select: {
          isSuspended: true,
        },
      },
    },
  });

  // Return a generic success response so callers cannot enumerate accounts.
  if (!linkedAccount || linkedAccount.user.isSuspended) {
    await emitAuthEvent("phone_login_code_requested", {
      ip,
      reason: linkedAccount ? "suspended_user" : "unknown_phone",
    });
    return NextResponse.json({ ok: true, expiresInSeconds: 600 });
  }

  const code = createPhoneLoginCode();
  const identifier = phoneLoginIdentifier(normalizedPhone);

  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { identifier } }),
    prisma.verificationToken.create({
      data: {
        identifier,
        token: hashPhoneLoginCode(code, normalizedPhone),
        expires: new Date(Date.now() + 10 * 60 * 1000),
      },
    }),
  ]);

  const smsResult = await sendPhoneLoginCode(normalizedPhone, code);

  if (!smsResult.ok) {
    await emitAuthEvent("phone_login_code_failed", {
      ip,
      userId: linkedAccount.userId,
      providerError: smsResult.error,
    });

    return NextResponse.json(
      { error: "We could not send a code right now. Please try again." },
      { status: 503 },
    );
  }

  await emitAuthEvent("phone_login_code_requested", {
    ip,
    userId: linkedAccount.userId,
  });

  return NextResponse.json({ ok: true, expiresInSeconds: 600 });
}
