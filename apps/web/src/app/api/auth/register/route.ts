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
import { getClientIp, hashAuthToken, normalizeEmail } from "@/lib/authIdentity";
import { normalizePhone } from "@/lib/phoneAuth";
import {
  evaluatePassword,
  personalTokensFor,
  MAX_LENGTH as PASSWORD_MAX_LENGTH,
  MIN_LENGTH as PASSWORD_MIN_LENGTH,
} from "@/lib/passwordStrength";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { recordRiskEvent } from "@/lib/riskEvents";
import { readJsonBodyLimited, withRouteTimeout } from "@/lib/apiHardening";

function generateCode(): string {
  return randomBytes(5).toString("hex").toUpperCase(); // 10-char hex code
}

const registerSchema = z.object({
  name:            z.string().min(1).max(100),
  email:           z.string().email(),
  password:        z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  // Optional on the server because legacy clients (mobile, etc.) don't
  // post it. When present we hard-fail on mismatch.
  confirmPassword: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH).optional(),
  phone:           z.string().max(32).optional(),
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
  // Cloudflare Turnstile token from the signup form. Optional on the
  // schema so non-browser clients (and pre-Turnstile deploys) still
  // work — verifyTurnstileToken is a no-op when the secret is unset.
  turnstileToken: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);

  try {
    await strictLimiter.consume(`register:${ip}`);
  } catch {
    await emitAuthEvent("register_rate_limited", { ip, retryAfterSeconds: 60 });
    await recordRiskEvent({
      eventType: "suspicious_signup",
      severity: "MEDIUM",
      ip,
      reason: "register_rate_limited",
      metadata: { retryAfterSeconds: 60 },
    });
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
    await emitAuthEvent("register_bot_blocked", {
      ip,
      reason: "botid_block",
      userAgent: req.headers.get("user-agent") ?? "unknown",
      secFetchSite: req.headers.get("sec-fetch-site") ?? "unknown",
      origin: req.headers.get("origin") ?? "unknown",
      referer: req.headers.get("referer") ?? "unknown",
    });
    await recordRiskEvent({
      eventType: "suspicious_signup",
      severity: "HIGH",
      ip,
      reason: "botid_block",
      metadata: {
        userAgent: req.headers.get("user-agent") ?? "unknown",
        secFetchSite: req.headers.get("sec-fetch-site") ?? "unknown",
        origin: req.headers.get("origin") ?? "unknown",
        referer: req.headers.get("referer") ?? "unknown",
      },
    });
    return NextResponse.json(
      { error: "Couldn't verify the request. Try again from a normal browser." },
      { status: 403 },
    );
  }

  try {
    const bodyResult = await readJsonBodyLimited<Record<string, unknown>>(req, {
      maxBytes: 24 * 1024,
    });
    if (!bodyResult.ok) return bodyResult.response;

    const body = bodyResult.value;
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

    const { name, email, password, confirmPassword, phone, role, inviteCode, callbackUrl, turnstileToken } = parsed.data;
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = phone ? normalizePhone(phone) : null;
    const safeCallbackUrl = sanitizeCallbackPath(callbackUrl);

    try {
      await strictLimiter.consume(`register:email:${normalizedEmail}`);
    } catch {
      await emitAuthEvent("register_rate_limited", {
        ip,
        email: normalizedEmail,
        retryAfterSeconds: 60,
      });
      await recordRiskEvent({
        eventType: "suspicious_signup",
        severity: "MEDIUM",
        ip,
        reason: "register_rate_limited_email",
        metadata: { email: normalizedEmail, retryAfterSeconds: 60 },
      });
      return NextResponse.json(
        { error: "Too many registration attempts for this email. Please try again later." },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }

    // Bot gate. When TURNSTILE_SECRET_KEY is unset the verifier returns
    // ok:true so dev / pre-Turnstile deploys still work.
    const turnstile = await verifyTurnstileToken(turnstileToken, ip);
    if (!turnstile.ok) {
      await emitAuthEvent("register_bot_blocked", {
        ip,
        reason: "turnstile_failed",
      });
      await recordRiskEvent({
        eventType: "suspicious_signup",
        severity: "HIGH",
        ip,
        reason: "turnstile_failed",
        metadata: { email: normalizedEmail },
      });
      return NextResponse.json(
        { error: "Bot-check didn't pass. Refresh the page and try again." },
        { status: 403 },
      );
    }

    if (confirmPassword !== undefined && confirmPassword !== password) {
      await emitAuthEvent("register_invalid_input", {
        ip,
        reason: "password_mismatch",
      });
      return NextResponse.json(
        { error: "Passwords don't match. Re-type the same password in both fields." },
        { status: 400 },
      );
    }

    const strengthResult = await withRouteTimeout("register-password-check", 1500, async () =>
      evaluatePassword(
        password,
        personalTokensFor({ name, email: normalizedEmail }),
      ),
    );
    if (!strengthResult.ok) return strengthResult.response;

    const strength = strengthResult.value;
    if (!strength.acceptable) {
      await emitAuthEvent("register_invalid_input", {
        ip,
        reason: "password_too_weak",
      });
      return NextResponse.json(
        {
          error:
            strength.hint ||
            `Password must be at least ${PASSWORD_MIN_LENGTH} characters and mix letters with numbers.`,
        },
        { status: 400 },
      );
    }

    if (phone && !normalizedPhone) {
      return NextResponse.json(
        { error: "Phone must be in international format, for example +15551234567." },
        { status: 400 },
      );
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: "insensitive",
        },
      },
      select: { id: true },
    });
    if (existingUser) {
      await emitAuthEvent("register_existing_email", {
        ip,
        email: normalizedEmail,
      });
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }

    if (normalizedPhone) {
      const existingPhone = await prisma.connectedAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider: "phone",
            providerAccountId: normalizedPhone,
          },
        },
        select: { id: true },
      });
      if (existingPhone) {
        return NextResponse.json(
          { error: "That phone number is already linked to another account." },
          { status: 409 },
        );
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Idempotent: if two clicks fire two concurrent register requests, the
    // unique-email constraint guarantees only one row is created. We catch
    // P2002 and report it as a regular "already exists" instead of a 500.
    let user;
    try {
      user = await prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: { name, email: normalizedEmail, passwordHash, role },
          select: { id: true, email: true, name: true, role: true },
        });

        if (normalizedPhone) {
          await tx.connectedAccount.create({
            data: {
              userId: createdUser.id,
              provider: "phone",
              providerAccountId: normalizedPhone,
            },
          });
        }

        return createdUser;
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "P2002") {
        if (normalizedPhone) {
          const existingPhone = await prisma.connectedAccount.findUnique({
            where: {
              provider_providerAccountId: {
                provider: "phone",
                providerAccountId: normalizedPhone,
              },
            },
            select: { id: true },
          });

          if (existingPhone) {
            return NextResponse.json(
              { error: "That phone number is already linked to another account." },
              { status: 409 },
            );
          }
        }

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
    let studioUsername: string | null = null;
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
      studioUsername = takenStudio ? `${baseSlug}-${user.id.slice(-4)}` : baseSlug;
      await prisma.studio.create({
        data: { userId: user.id, username: studioUsername },
      }).catch(() => {
        // Race collision — look up the actual slug so the response is correct.
        studioUsername = null;
      });
    }

    // Create email verification token and send welcome email
    const verifyToken = randomBytes(32).toString("hex");
    await prisma.verificationToken.create({
      data: {
        identifier: normalizedEmail,
        token: hashAuthToken(verifyToken),
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

      // Email provider not configured or failed — auto-verify so the user
      // isn't permanently locked out of an account they just created.
      // When RESEND is properly configured this branch is never reached.
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: new Date() },
      });

      return NextResponse.json(
        {
          user,
          requiresVerification: false,
          verificationEmailSent: false,
          autoVerified: true,
          studioUsername,
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
      { user, requiresVerification: true, verificationEmailSent: true, studioUsername },
      { status: 201 },
    );
  } catch (err) {
    const requestId = randomBytes(4).toString("hex");
    console.error("[register]", requestId, err);
    return NextResponse.json({ error: "Internal server error", requestId }, { status: 500 });
  }
}
