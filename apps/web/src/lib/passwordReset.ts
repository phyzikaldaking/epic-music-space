import { randomBytes } from "node:crypto";
import { hash as bcryptHash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/email";
import { hashAuthToken, normalizeEmail } from "@/lib/authIdentity";

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

export async function issuePasswordReset(emailInput: string) {
  const email = normalizeEmail(emailInput);

  const user = await prisma.user.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      email: true,
      passwordHash: true,
    },
  });

  if (!user?.passwordHash) {
    return { ok: true as const };
  }

  await prisma.passwordResetToken.deleteMany({
    where: { userId: user.id, usedAt: null, expires: { gt: new Date() } },
  });

  const rawToken = randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashAuthToken(rawToken),
      expires: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });

  try {
    await sendPasswordResetEmail(user.email, rawToken);
  } catch (error) {
    console.error("[password-reset] email send failed", error);
  }

  return { ok: true as const };
}

export async function completePasswordReset(
  rawToken: string,
  password: string,
  opts?: { revokeSessions?: boolean },
) {
  const tokenHash = hashAuthToken(rawToken);

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, usedAt: true, expires: true },
  });

  if (!record || record.usedAt || record.expires < new Date()) {
    return { ok: false as const, error: "invalid_or_expired" as const };
  }

  const passwordHash = await bcryptHash(password, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null, id: { not: record.id } },
      data: { usedAt: new Date() },
    }),
    ...(opts?.revokeSessions === false
      ? []
      : [prisma.session.deleteMany({ where: { userId: record.userId } })]),
  ]);

  return { ok: true as const };
}
