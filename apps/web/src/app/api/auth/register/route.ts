import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { maybeAwardEarlyAdopter } from "@/lib/badges";
import { sendVerificationEmail } from "@/lib/email";
import { randomBytes } from "crypto";
import { strictLimiter } from "@/lib/rateLimit";
import { emitAuthEvent } from "@/lib/authObservability";

function generateCode(): string {
  return randomBytes(5).toString("hex").toUpperCase(); // 10-char hex code
}

const registerSchema = z.object({
  name:       z.string().min(1).max(100),
  email:      z.string().email(),
  password:   z.string().min(8).max(128),
  role:       z.enum(["LISTENER", "ARTIST", "LABEL"]).default("LISTENER"),
  inviteCode: z.string().max(20).optional(),
});

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  try {
    await strictLimiter.consume(`register:${ip}`);
  } catch {
    await emitAuthEvent("register_rate_limited", { ip, retryAfterSeconds: 60 });
    return NextResponse.json(
      { error: "Too many registration attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      await emitAuthEvent("register_invalid_input", {
        ip,
        reason: parsed.error.issues[0]?.message ?? "invalid_input",
      });
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const { name, email, password, role, inviteCode } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      await emitAuthEvent("register_existing_email", {
        ip,
        email: normalizedEmail,
      });
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { name, email: normalizedEmail, passwordHash, role },
      select: { id: true, email: true, name: true, role: true },
    });

    await emitAuthEvent("register_created", {
      ip,
      email: normalizedEmail,
      userId: user.id,
      role: user.role,
    });

    // Create a personal invite code for the new user
    await prisma.inviteCode.create({
      data: {
        code: generateCode(),
        createdById: user.id,
      },
    }).catch(() => { /* ignore on collision */ });

    // Award EARLY_ADOPTER badge if within the first 1 000 users
    await maybeAwardEarlyAdopter(user.id);

    // Apply invite code if provided
    if (inviteCode) {
      const code = inviteCode.trim().toUpperCase();
      const invite = await prisma.inviteCode.findUnique({ where: { code } });
      if (invite && !invite.usedById && invite.createdById !== user.id) {
        await prisma.inviteCode.update({
          where: { id: invite.id },
          data: { usedById: user.id, usedAt: new Date() },
        });
        // Check milestone badges for the inviter
        const { checkInviteMilestones } = await import("@/lib/badges");
        await checkInviteMilestones(invite.createdById);
      }
    }

    // Create email verification token and send welcome email
    const verifyToken = randomBytes(32).toString("hex");
    await prisma.verificationToken.create({
      data: {
        identifier: normalizedEmail,
        token: verifyToken,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    const verificationEmail = await sendVerificationEmail(normalizedEmail, verifyToken);

    if (!verificationEmail.ok) {
      await emitAuthEvent("verification_email_send_failed", {
        ip,
        email: normalizedEmail,
        userId: user.id,
        role: user.role,
        providerError:
          typeof verificationEmail.error === "object" && verificationEmail.error !== null
            ? JSON.stringify(verificationEmail.error)
            : String(verificationEmail.error ?? "unknown"),
      });

      return NextResponse.json(
        {
          user,
          requiresVerification: true,
          verificationEmailSent: false,
          error:
            "We could not send your verification email right now. Please use resend verification in a moment and check your spam folder.",
        },
        { status: 201 },
      );
    }

    await emitAuthEvent("verification_email_sent", {
      ip,
      email: normalizedEmail,
      userId: user.id,
      role: user.role,
    });

    return NextResponse.json(
      { user, requiresVerification: true, verificationEmailSent: true },
      { status: 201 },
    );
  } catch (err) {
    console.error("[register]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

