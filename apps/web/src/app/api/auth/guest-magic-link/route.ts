/**
 * POST /api/auth/guest-magic-link
 *
 * Single-field signup for the guest-resume flow. Existing /api/auth/magic-link
 * intentionally no-ops for unknown emails to prevent enumeration on the
 * regular signin form. That semantic is wrong for the guest-resume case:
 * the visitor *just made a track* and we want to capture the email and
 * keep them moving — failing silently would lose them.
 *
 * This endpoint:
 *   1. Accepts an email address.
 *   2. Creates a passwordless ARTIST account if the email is new
 *      (emailVerified=null; gets set on first link click via the
 *      existing email-link credentials provider in lib/auth.ts).
 *   3. Issues a single-use 15-minute magic-link token.
 *   4. Sends the link.
 *
 * The visitor then gets one email, clicks one link, lands authenticated
 * back on /studio/new?from=guest-resume and the existing GuestResumePublish
 * client picks up the WAV blob from IndexedDB and finishes the upload.
 *
 * Suspended accounts get treated like the regular flow — silently ok'd
 * to avoid leaking suspension status, but no link is issued.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { strictLimiter } from "@/lib/rateLimit";
import { emitAuthEvent } from "@/lib/authObservability";
import { getClientIp, hashAuthToken, normalizeEmail } from "@/lib/authIdentity";
import { sendMagicLinkEmail } from "@/lib/email";
import { MAGIC_LINK_IDENTIFIER_PREFIX } from "@/lib/auth";

export const runtime = "nodejs";

const requestSchema = z.object({
  email: z.string().email().max(254),
  // Constrained to in-app paths. Forwarded to the verify page so the
  // visitor lands back at /studio/new?from=guest-resume.
  callbackUrl: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);

  try {
    await strictLimiter.consume(`guest-magic-link:request:ip:${ip}`);
  } catch {
    return NextResponse.json(
      { error: "Too many requests. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const body = (await req.json().catch(() => ({}))) as unknown;
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const { email, callbackUrl } = parsed.data;
  const normalizedEmail = normalizeEmail(email);

  // Per-email rate limit on top of per-IP. Same shape as /api/auth/magic-link.
  try {
    await strictLimiter.consume(`guest-magic-link:request:email:${normalizedEmail}`);
  } catch {
    return NextResponse.json(
      { error: "Too many requests for this email. Try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  // Look up or create the user. New accounts default to ARTIST so the
  // guest can actually publish on the other side without being routed
  // through /studio/setup as a LISTENER.
  let user = await prisma.user.findFirst({
    where: { email: { equals: normalizedEmail, mode: "insensitive" } },
    select: { id: true, isSuspended: true },
  });

  let isNewAccount = false;
  if (!user) {
    try {
      const created = await prisma.user.create({
        data: {
          email: normalizedEmail,
          role: "ARTIST",
          // emailVerified gets set when they click the link (handled by
          // the email-link CredentialsProvider in lib/auth.ts).
        },
        select: { id: true, isSuspended: true },
      });
      user = created;
      isNewAccount = true;
      await emitAuthEvent("register_created", {
        ip,
        email: normalizedEmail,
        userId: created.id,
        reason: "guest_publish_resume",
      });
    } catch {
      // Race: another request created the user between our findFirst
      // and create. Re-read.
      user = await prisma.user.findFirst({
        where: { email: { equals: normalizedEmail, mode: "insensitive" } },
        select: { id: true, isSuspended: true },
      });
      if (!user) {
        return NextResponse.json(
          { error: "Could not create your account. Please try again." },
          { status: 500 },
        );
      }
    }
  }

  if (user.isSuspended) {
    await emitAuthEvent("magic_link_skipped", {
      ip,
      email: normalizedEmail,
      userId: user.id,
      reason: "suspended_user",
    });
    // Don't leak suspension to the requester.
    return NextResponse.json({ ok: true, isNewAccount: false });
  }

  // Issue the token. Same crypto + storage as /api/auth/magic-link so
  // the existing email-link verifier in lib/auth.ts accepts it.
  const token = randomBytes(32).toString("hex");
  const hashedToken = hashAuthToken(token);
  const identifier = `${MAGIC_LINK_IDENTIFIER_PREFIX}${normalizedEmail}`;

  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({
    data: {
      identifier,
      token: hashedToken,
      expires: new Date(Date.now() + 15 * 60 * 1000),
    },
  });

  const emailResult = await sendMagicLinkEmail(normalizedEmail, token, callbackUrl);

  if (!emailResult.ok) {
    await emitAuthEvent("magic_link_send_failed", {
      ip,
      email: normalizedEmail,
      userId: user.id,
      providerError: typeof emailResult.error === "object"
        ? JSON.stringify(emailResult.error)
        : String(emailResult.error ?? "unknown"),
    });
    return NextResponse.json(
      { error: "Couldn't send the sign-in link. Please try again in a moment." },
      { status: 502 },
    );
  }

  await emitAuthEvent("magic_link_sent", {
    ip,
    email: normalizedEmail,
    userId: user.id,
  });

  return NextResponse.json({ ok: true, isNewAccount });
}
