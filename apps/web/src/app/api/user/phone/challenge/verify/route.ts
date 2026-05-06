import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { strictLimiter } from "@/lib/rateLimit";
import { getClientIp, hashAuthToken } from "@/lib/authIdentity";
import {
  hashPhoneLoginCode,
  phoneManageCodeIdentifier,
  phoneManageGrantIdentifier,
} from "@/lib/phoneAuth";

const bodySchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);

  try {
    await strictLimiter.consume(`profile-phone:challenge-verify:ip:${ip}`);
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

  const body = (await req.json().catch(() => ({}))) as unknown;
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid code." }, { status: 400 });
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

  const codeIdentifier = phoneManageCodeIdentifier(session.user.id);
  const matchingCode = await prisma.verificationToken.findFirst({
    where: {
      identifier: codeIdentifier,
      token: hashPhoneLoginCode(parsed.data.code, linked.providerAccountId),
      expires: { gt: new Date() },
    },
    select: { token: true },
  });

  if (!matchingCode) {
    return NextResponse.json(
      { error: "Invalid or expired code." },
      { status: 400 },
    );
  }

  const rawManageToken = randomBytes(32).toString("hex");
  const grantIdentifier = phoneManageGrantIdentifier(session.user.id);

  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { identifier: codeIdentifier } }),
    prisma.verificationToken.deleteMany({ where: { identifier: grantIdentifier } }),
    prisma.verificationToken.create({
      data: {
        identifier: grantIdentifier,
        token: hashAuthToken(rawManageToken),
        expires: new Date(Date.now() + 10 * 60 * 1000),
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    manageToken: rawManageToken,
    expiresInSeconds: 600,
  });
}
