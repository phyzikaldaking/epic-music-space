import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site";
import { emitAuthEvent } from "@/lib/authObservability";
import { appendCallbackParam, sanitizeCallbackPath } from "@/lib/safeCallback";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const token = searchParams.get("token");
  const email = searchParams.get("email");
  const callbackUrl = sanitizeCallbackPath(searchParams.get("callbackUrl"));
  const normalizedEmail = email?.trim().toLowerCase();
  const base = getSiteUrl();
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  if (!token || !normalizedEmail) {
    await emitAuthEvent("verify_invalid_link", {
      ip,
      email: normalizedEmail,
      reason: "missing_token_or_email",
    });
    return NextResponse.redirect(`${base}/auth/verify-email?error=invalid`);
  }

  const record = await prisma.verificationToken.findUnique({
    where: { token },
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
    await prisma.verificationToken.delete({ where: { token } }).catch(() => {});
    await emitAuthEvent("verify_expired_link", {
      ip,
      email: normalizedEmail,
      reason: "token_expired",
    });
    return NextResponse.redirect(`${base}/auth/verify-email?error=expired&email=${encodeURIComponent(normalizedEmail)}`);
  }

  await prisma.$transaction([
    prisma.user.updateMany({
      where: { email: normalizedEmail, emailVerified: null },
      data: { emailVerified: new Date() },
    }),
    prisma.verificationToken.delete({ where: { token } }),
  ]);

  await emitAuthEvent("verify_success", {
    ip,
    email: normalizedEmail,
  });

  return NextResponse.redirect(
    `${base}${appendCallbackParam("/auth/signin?verified=true", callbackUrl)}`,
  );
}
