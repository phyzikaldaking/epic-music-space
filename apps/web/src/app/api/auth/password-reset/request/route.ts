import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/email";
import { strictLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";

const schema = z.object({ email: z.string().email() });

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  try {
    await strictLimiter.consume(`pwreset:${ip}`);
  } catch {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  // Always return ok=true regardless of whether the email exists — prevents
  // enumeration. The actual sender no-ops if no user matches.
  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    select: { id: true, email: true, passwordHash: true },
  });

  if (user?.passwordHash) {
    // Per-user rate limit: at most 1 active token at a time. Newer requests
    // invalidate older ones by deleting all unexpired/unused tokens for the user.
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null, expires: { gt: new Date() } },
    });

    const raw = randomBytes(32).toString("hex");
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(raw),
        expires: new Date(Date.now() + TOKEN_TTL_MS),
      },
    });
    await sendPasswordResetEmail(user.email, raw);
  }

  return NextResponse.json({ ok: true });
}
