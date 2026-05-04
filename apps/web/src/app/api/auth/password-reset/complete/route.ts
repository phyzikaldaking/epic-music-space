import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { hash as bcryptHash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { strictLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().min(32).max(128),
  password: z.string().min(8).max(200),
});

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  try {
    await strictLimiter.consume(`pwreset-complete:${ip}`);
  } catch {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const tokenHash = hashToken(parsed.data.token);

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
  });
  if (!record || record.usedAt || record.expires < new Date()) {
    return NextResponse.json({ error: "Reset link is invalid or expired." }, { status: 400 });
  }

  const newHash = await bcryptHash(parsed.data.password, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: newHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    // Belt-and-braces: invalidate any other outstanding reset tokens for
    // this user — only one reset path can run at a time.
    prisma.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null, id: { not: record.id } },
      data: { usedAt: new Date() },
    }),
    // Sign out all existing sessions to defeat anyone holding a stale cookie.
    prisma.session.deleteMany({ where: { userId: record.userId } }),
  ]);

  return NextResponse.json({ ok: true });
}
