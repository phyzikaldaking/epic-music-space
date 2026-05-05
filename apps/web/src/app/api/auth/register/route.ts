import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { maybeAwardEarlyAdopter } from "@/lib/badges";
import { sendVerificationEmail } from "@/lib/email";
import { randomBytes } from "crypto";
import { strictLimiter } from "@/lib/rateLimit";
import { isLikelyBot } from "@/lib/botCheck";
import { emitAuthEvent } from "@/lib/authObservability";
import { sanitizeCallbackPath } from "@/lib/safeCallback";

function generateCode(): string {
  return randomBytes(5).toString("hex").toUpperCase(); // 10-char hex code
}

const registerSchema = z.object({
  name:       z.string().min(1).max(100),
  email:      z.string().email(),
  password:   z
    .string()
    .min(12, "Password must be at least 12 characters")
    .max(128)
    .regex(/[A-Z]/, "Password must include at least one uppercase letter")
    .regex(/[a-z]/, "Password must include at least one lowercase letter")
    .regex(/[0-9]/, "Password must include at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must include at least one symbol"),
  role:       z.enum(["LISTENER", "ARTIST", "PRODUCER", "ENGINEER", "LABEL"]).default("LISTENER"),
  inviteCode: z.string().max(20).optional(),
  callbackUrl: z.string().max(500).optional(),
  // COPPA + ToS gates. Both are required to register; the schema rejects
  // anything that isn't literally `true` so a missing checkbox in the
  // form is a 400 with a clear field-level error rather than a silent
  // signup. We don't store the underage user at all.
  ageConfirmed: z.literal(true, {
    errorMap: () => ({ message: "You must confirm you are at least 13 years old." }),
  }),
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: "You must accept the Terms of Service and Privacy Policy." }),
  }),
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

  // Vercel BotID — block obvious bot traffic before we burn DB writes on a
  // signup that's almost certainly going to be deleted in moderation. Soft
  // fail: if BotID is misconfigured the helper returns false (not bot) so
  // we never lock real users out.
  if (await isLikelyBot()) {
    await emitAuthEvent("register_bot_blocked", { ip });
    return NextResponse.json(
      { error: "Couldn't verify the request. Try again from a normal browser." },
      { status: 403 },
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

    const { name, email, password, role, inviteCode, callbackUrl } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();
    const safeCallbackUrl = sanitizeCallbackPath(callbackUrl);

    const passwordHash = await bcrypt.hash(password, 12);

    // Idempotent: if two clicks fire two concurrent register requests, the
    // unique-email constraint guarantees only one row is created. We catch
    // P2002 and report it as a regular "already exists" instead of a 500.
    let user;
    try {
      user = await prisma.user.create({
        data: { name, email: normalizedEmail, passwordHash, role },
        select: { id: true, email: true, name: true, role: true },
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "P2002") {
        await emitAuthEvent("register_existing_email", {
          ip,
          email: normalizedEmail,
        });
        return NextResponse.json(
          { error: "An account with this email already exists." },
          { status: 409 },
        );
      }
      throw err;
    }

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

    // Auto-create Studio profile for artists so /studio works from day one
    if (role === "ARTIST" || role === "LABEL") {
      const baseSlug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 28) || "artist";
      const takenStudio = await prisma.studio.findFirst({
        where: { username: baseSlug },
        select: { id: true },
      });
      const studioUsername = takenStudio ? `${baseSlug}-${user.id.slice(-4)}` : baseSlug;
      await prisma.studio.create({
        data: { userId: user.id, username: studioUsername },
      }).catch(() => { /* ignore race condition */ });
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
    const verificationEmail = await sendVerificationEmail(
      normalizedEmail,
      verifyToken,
      safeCallbackUrl,
    );

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
