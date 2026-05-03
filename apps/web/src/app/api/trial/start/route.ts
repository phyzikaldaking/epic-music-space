import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const TRIAL_DAYS = 7;

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to start your free trial." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { subscriptionTier: true, trialExpiresAt: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  // Already on a paid plan
  if (!["FREE", "TRIAL"].includes(user.subscriptionTier)) {
    return NextResponse.json(
      { error: "You already have an active paid plan." },
      { status: 409 },
    );
  }

  // Trial already used (trialExpiresAt is set even after expiry — it's a one-time offer)
  if (user.trialExpiresAt !== null) {
    return NextResponse.json(
      { error: "Your free trial has already been used." },
      { status: 409 },
    );
  }

  const trialExpiresAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.user.update({
    where: { id: session.user.id },
    data: { subscriptionTier: "TRIAL", trialExpiresAt },
  });

  return NextResponse.json({
    ok: true,
    expiresAt: trialExpiresAt.toISOString(),
    message: `Your ${TRIAL_DAYS}-day Pro trial is now active!`,
  });
}
