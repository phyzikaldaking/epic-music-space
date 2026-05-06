import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { strictLimiter } from "@/lib/rateLimit";
import { getClientIp, hashAuthToken } from "@/lib/authIdentity";
import {
  maskPhone,
  normalizePhone,
  phoneManageGrantIdentifier,
} from "@/lib/phoneAuth";

const patchSchema = z.object({
  phone: z.string().max(32).optional(),
  remove: z.boolean().optional(),
  manageToken: z.string().min(32).max(256).optional(),
});

export async function GET(req: NextRequest) {
  const ip = getClientIp(req.headers);

  try {
    await strictLimiter.consume(`profile-phone:get:${ip}`);
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
  const userId = session.user.id;

  const linked = await prisma.connectedAccount.findFirst({
    where: {
      userId,
      provider: "phone",
    },
    select: { providerAccountId: true },
  });

  return NextResponse.json({
    phoneLinked: Boolean(linked?.providerAccountId),
    maskedPhone: linked?.providerAccountId
      ? maskPhone(linked.providerAccountId)
      : null,
  });
}

export async function PATCH(req: NextRequest) {
  const ip = getClientIp(req.headers);

  try {
    await strictLimiter.consume(`profile-phone:patch:${ip}`);
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
  const userId = session.user.id;

  const raw = (await req.json().catch(() => ({}))) as unknown;
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const { remove = false, phone, manageToken } = parsed.data;

  const existingLinked = await prisma.connectedAccount.findFirst({
    where: { userId, provider: "phone" },
    select: { providerAccountId: true },
  });

  async function assertFreshManageChallenge() {
    if (!manageToken) {
      return NextResponse.json(
        {
          error:
            "Verify with your current phone before replacing or removing it.",
        },
        { status: 403 },
      );
    }

    const grantIdentifier = phoneManageGrantIdentifier(userId);
    const grant = await prisma.verificationToken.findFirst({
      where: {
        identifier: grantIdentifier,
        token: hashAuthToken(manageToken),
        expires: { gt: new Date() },
      },
      select: { token: true },
    });

    if (!grant) {
      return NextResponse.json(
        {
          error:
            "Phone verification expired. Verify again before changing this phone.",
        },
        { status: 403 },
      );
    }

    await prisma.verificationToken.deleteMany({
      where: { identifier: grantIdentifier },
    });

    return null;
  }

  if (remove) {
    if (existingLinked) {
      const deny = await assertFreshManageChallenge();
      if (deny) return deny;
    }

    await prisma.connectedAccount.deleteMany({
      where: { userId, provider: "phone" },
    });

    return NextResponse.json({
      ok: true,
      phoneLinked: false,
      maskedPhone: null,
    });
  }

  if (!phone) {
    return NextResponse.json(
      { error: "Provide a phone number or set remove=true." },
      { status: 400 },
    );
  }

  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    return NextResponse.json(
      { error: "Phone must be in international format, for example +15551234567." },
      { status: 400 },
    );
  }

  if (
    existingLinked?.providerAccountId &&
    existingLinked.providerAccountId !== normalizedPhone
  ) {
    const deny = await assertFreshManageChallenge();
    if (deny) return deny;
  }

  const existing = await prisma.connectedAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: "phone",
        providerAccountId: normalizedPhone,
      },
    },
    select: { userId: true },
  });

  if (existing && existing.userId !== userId) {
    return NextResponse.json(
      { error: "That phone number is already linked to another account." },
      { status: 409 },
    );
  }

  await prisma.$transaction([
    prisma.connectedAccount.deleteMany({
      where: { userId, provider: "phone" },
    }),
    prisma.connectedAccount.create({
      data: {
        userId,
        provider: "phone",
        providerAccountId: normalizedPhone,
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    phoneLinked: true,
    maskedPhone: maskPhone(normalizedPhone),
  });
}
