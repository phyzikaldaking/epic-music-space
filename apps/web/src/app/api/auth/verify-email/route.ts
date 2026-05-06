import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site";
import { emitAuthEvent } from "@/lib/authObservability";
import { appendCallbackParam, sanitizeCallbackPath } from "@/lib/safeCallback";
import { getClientIp, hashAuthToken, normalizeEmail } from "@/lib/authIdentity";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const token = searchParams.get("token");
  const email = searchParams.get("email");
  const callbackUrl = sanitizeCallbackPath(searchParams.get("callbackUrl"));
  const normalizedEmail = email ? normalizeEmail(email) : null;
  const base = getSiteUrl();
  const ip = getClientIp(req.headers);

  if (!token || !normalizedEmail) {
    await emitAuthEvent("verify_invalid_link", {
      ip,
      email: normalizedEmail ?? undefined,
      reason: "missing_token_or_email",
    });
    return NextResponse.redirect(`${base}/auth/verify-email?error=invalid`);
  }

  // Tokens are sha256-hashed at issue time. Look up by hash only — the
  // previous "fallback to raw-token lookup for legacy links" was a
  // permanent backdoor: any plaintext token leaked in logs / forwarded
  // emails / support pastes stayed valid forever. Tokens issued before
  // hashing was rolled out have all expired (24h TTL) so the migration
  // window has long closed.
  const hashedToken = hashAuthToken(token);
  const record = await prisma.verificationToken.findUnique({
    where: { token: hashedToken },
  });

  if (!record || record.identifier.toLowerCase() !== normalizedEmail) {
    await emitAuthEvent("verify_invalid_link", {
      ip,
      email: normalizedEmail,
      reason: "token_not_found_or_identifier_mismatch",
    });
    return NextResponse.redirect(`${base}/auth/verify-email?error=invalid`);
  }

  if (record.expires < new Date()) {
    await prisma.verificationToken
      .delete({ where: { token: record.token } })
      .catch(() => {});
    await emitAuthEvent("verify_expired_link", {
      ip,
      email: normalizedEmail,
      reason: "token_expired",
    });
    return NextResponse.redirect(`${base}/auth/verify-email?error=expired&email=${encodeURIComponent(normalizedEmail)}`);
  }

  await prisma.$transaction([
    prisma.user.updateMany({
      where: {
        email: {
          equals: normalizedEmail,
          mode: "insensitive",
        },
        emailVerified: null,
      },
      data: { emailVerified: new Date() },
    }),
    prisma.verificationToken.delete({ where: { token: record.token } }),
  ]);

  await emitAuthEvent("verify_success", {
    ip,
    email: normalizedEmail,
  });

  return NextResponse.redirect(
    `${base}${appendCallbackParam("/auth/signin?verified=true", callbackUrl)}`,
  );
}
