import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { strictLimiter } from "@/lib/rateLimit";
import { completePasswordReset } from "@/lib/passwordReset";
import { getClientIp } from "@/lib/authIdentity";
import {
  evaluatePassword,
  MAX_LENGTH as PASSWORD_MAX_LENGTH,
  MIN_LENGTH as PASSWORD_MIN_LENGTH,
} from "@/lib/passwordStrength";

export const runtime = "nodejs";

const bodySchema = z.object({
  token: z.string().min(64).max(128),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});

/**
 * POST /api/auth/reset-password — confirm a password reset.
 * Body: { token, password }
 *
 * Token is the raw hex string emailed to the user. We sha256 it and look
 * up the matching unused, unexpired PasswordResetToken row, then update
 * the user's passwordHash and mark the token used in a single transaction.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  try {
    await strictLimiter.consume(`reset-password:${ip}`);
  } catch {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a minute." },
      { status: 429 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const { token, password } = parsed.data;

  // Reject weak / common passwords with the same rules signup uses, so a
  // user can't reset *to* a password their original signup would have
  // refused. We don't have name/email here without doing a DB lookup
  // first — passing [] as personalTokens just skips the soft penalty,
  // which is acceptable: the meter still enforces length + variety + the
  // common-password blocklist.
  const strength = evaluatePassword(password, []);
  if (!strength.acceptable) {
    return NextResponse.json(
      {
        error:
          strength.hint ||
          `Password must be at least ${PASSWORD_MIN_LENGTH} characters and mix letters with numbers.`,
      },
      { status: 400 },
    );
  }

  const outcome = await completePasswordReset(token, password, {
    revokeSessions: true,
  });
  if (!outcome.ok) {
    return NextResponse.json(
      { error: "This reset link has expired. Request a new one." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
