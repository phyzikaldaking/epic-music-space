import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { strictLimiter } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/authIdentity";
import {
  createPhoneLoginCode,
  hashPhoneLoginCode,
  phoneManageCodeIdentifier,
  sendPhoneLoginCode,
} from "@/lib/phoneAuth";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);

  try {
    await strictLimiter.consume(`profile-phone:challenge-request:ip:${ip}`);
  } catch {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const linked = await prisma.connectedAccount.findFirst({
    where: {
      userId: session.user.id,
      provider: "phone",
    },
    select: { providerAccountId: true },
  });

  if (!linked?.providerAccountId) {
    return NextResponse.json(
      { error: "No phone is currently linked to this account." },
      { status: 400 },
    );
  }

  try {
    await strictLimiter.consume(`profile-phone:challenge-request:user:${session.user.id}`);
  } catch {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const code = createPhoneLoginCode();
  const identifier = phoneManageCodeIdentifier(session.user.id);

  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { identifier } }),
    prisma.verificationToken.create({
      data: {
        identifier,
        token: hashPhoneLoginCode(code, linked.providerAccountId),
        expires: new Date(Date.now() + 10 * 60 * 1000),
      },
    }),
  ]);

  const sms = await sendPhoneLoginCode(linked.providerAccountId, code);
  if (!sms.ok) {
    return NextResponse.json(
      { error: "Could not send verification code. Try again." },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, expiresInSeconds: 600 });
}
