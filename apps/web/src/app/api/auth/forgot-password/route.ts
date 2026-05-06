import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { strictLimiter } from "@/lib/rateLimit";
import { issuePasswordReset } from "@/lib/passwordReset";
import { getClientIp } from "@/lib/authIdentity";

export const runtime = "nodejs";

const bodySchema = z.object({ email: z.string().email() });

/**
 * POST /api/auth/forgot-password — request a password reset link.
 *
 * Always returns 200 with `{ ok: true }` regardless of whether the email
 * exists, so the endpoint can't be used as an account-enumeration oracle.
 * On rate-limit we still return 200, but include a `throttled: true` flag
 * + `Retry-After` header so the client can surface a friendly "wait a
 * moment" message instead of falsely reporting "email sent." Without this
 * the previous behaviour silently dropped the user's second click and
 * left them refreshing an inbox that was never going to receive a
 * second link.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  try {
    await strictLimiter.consume(`forgot-password:${ip}`);
  } catch {
    return NextResponse.json(
      { ok: true, throttled: true },
      { status: 200, headers: { "Retry-After": "60" } },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: true });

  await issuePasswordReset(parsed.data.email);

  return NextResponse.json({ ok: true });
}
