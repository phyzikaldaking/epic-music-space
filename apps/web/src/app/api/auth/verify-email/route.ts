import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const token = searchParams.get("token");
  const email = searchParams.get("email");
  const base = getSiteUrl();

  if (!token || !email) {
    return NextResponse.redirect(`${base}/auth/verify-email?error=invalid`);
  }

  const record = await prisma.verificationToken.findUnique({
    where: { token },
  });

  if (!record || record.identifier !== email) {
    return NextResponse.redirect(`${base}/auth/verify-email?error=invalid`);
  }

  if (record.expires < new Date()) {
    await prisma.verificationToken.delete({ where: { token } }).catch(() => {});
    return NextResponse.redirect(`${base}/auth/verify-email?error=expired&email=${encodeURIComponent(email)}`);
  }

  await prisma.$transaction([
    prisma.user.updateMany({
      where: { email, emailVerified: null },
      data: { emailVerified: new Date() },
    }),
    prisma.verificationToken.delete({ where: { token } }),
  ]);

  return NextResponse.redirect(`${base}/auth/signin?verified=true`);
}
