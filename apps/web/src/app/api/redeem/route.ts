import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { strictLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";

const bodySchema = z.object({
  code: z.string().min(3).max(64),
});

// Validates the JSON `reward` payload that lives on RedeemCode.reward.
// Adding a new reward type is a one-line change here — schema is JSONB
// so no migration needed.
const rewardSchema = z
  .object({
    bonusSongSlots: z.number().int().min(0).max(500).optional(),
    trialDays: z.number().int().min(0).max(365).optional(),
    freeBoostCredits: z.number().int().min(0).max(50).optional(),
    freeLicenseFeeWaivers: z.number().int().min(0).max(50).optional(),
    note: z.string().max(200).optional(),
  })
  .refine(
    (r) =>
      (r.bonusSongSlots ?? 0) +
        (r.trialDays ?? 0) +
        (r.freeBoostCredits ?? 0) +
        (r.freeLicenseFeeWaivers ?? 0) >
      0,
    { message: "Reward grants nothing" },
  );

type Reward = z.infer<typeof rewardSchema>;

/**
 * POST /api/redeem
 * Redeem a code on behalf of the authenticated user. Idempotent per
 * (codeId, userId) — a duplicate redemption returns 409 instead of
 * granting twice.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to redeem a code." }, { status: 401 });
  }

  try {
    await strictLimiter.consume(`redeem:${session.user.id}`);
  } catch {
    return NextResponse.json(
      { error: "Too many redeem attempts. Slow down for a minute." },
      { status: 429 },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const code = parsed.data.code.trim().toUpperCase();
  const codeRow = await prisma.redeemCode.findUnique({ where: { code } });
  if (!codeRow) {
    // Generic "not valid" so we don't leak whether a code exists or
    // is just out of uses — burns enumeration attempts.
    return NextResponse.json({ error: "That code isn't valid." }, { status: 404 });
  }
  if (codeRow.frozenAt) {
    return NextResponse.json({ error: "That code is no longer active." }, { status: 410 });
  }
  if (codeRow.expiresAt && codeRow.expiresAt < new Date()) {
    return NextResponse.json({ error: "That code has expired." }, { status: 410 });
  }
  if (codeRow.maxUses != null && codeRow.uses >= codeRow.maxUses) {
    return NextResponse.json(
      { error: "That code has been fully redeemed." },
      { status: 410 },
    );
  }

  const rewardParsed = rewardSchema.safeParse(codeRow.reward);
  if (!rewardParsed.success) {
    // Bad data in the row — not the user's fault. Log and 500.
    console.error("[redeem] malformed reward payload", { codeId: codeRow.id });
    return NextResponse.json(
      { error: "That code is misconfigured. Reach out to support." },
      { status: 500 },
    );
  }
  const reward: Reward = rewardParsed.data;

  // Atomic grant: take the slot on RedeemRedemption (unique enforces
  // one-per-user), bump the per-user counters, push trialExpiresAt
  // forward if requested, and increment the code's use counter.
  // All-or-nothing so a mid-transaction crash can't half-grant.
  try {
    const trialExtensionMs =
      reward.trialDays && reward.trialDays > 0
        ? reward.trialDays * 24 * 60 * 60 * 1000
        : 0;

    const result = await prisma.$transaction(async (tx) => {
      await tx.redeemRedemption.create({
        data: {
          codeId: codeRow.id,
          userId: session.user!.id,
          reward,
        },
      });

      // Resolve current trial baseline so we extend from "now or whenever
      // the existing trial would have expired" — never shorten one.
      const user = await tx.user.findUnique({
        where: { id: session.user!.id },
        select: { trialExpiresAt: true, subscriptionTier: true },
      });
      let nextTrialExpiresAt = user?.trialExpiresAt ?? null;
      if (trialExtensionMs > 0) {
        const baseline =
          user?.trialExpiresAt && user.trialExpiresAt > new Date()
            ? user.trialExpiresAt
            : new Date();
        nextTrialExpiresAt = new Date(baseline.getTime() + trialExtensionMs);
      }

      await tx.user.update({
        where: { id: session.user!.id },
        data: {
          ...(reward.bonusSongSlots && {
            bonusSongSlots: { increment: reward.bonusSongSlots },
          }),
          ...(reward.freeBoostCredits && {
            freeBoostCredits: { increment: reward.freeBoostCredits },
          }),
          ...(reward.freeLicenseFeeWaivers && {
            freeLicenseFeeWaivers: { increment: reward.freeLicenseFeeWaivers },
          }),
          ...(trialExtensionMs > 0 && {
            trialExpiresAt: nextTrialExpiresAt,
            // If they were FREE, flip them onto TRIAL so the rest of
            // the platform unlocks (analytics, boost, versus, etc.).
            // Don't downgrade an existing paid plan.
            ...(user?.subscriptionTier === "FREE" && { subscriptionTier: "TRIAL" }),
          }),
        },
      });

      await tx.redeemCode.update({
        where: { id: codeRow.id },
        data: { uses: { increment: 1 } },
      });

      return { reward, trialExpiresAt: nextTrialExpiresAt };
    });

    return NextResponse.json({
      ok: true,
      reward: result.reward,
      trialExpiresAt: result.trialExpiresAt,
    });
  } catch (err) {
    // Unique-constraint hit on RedeemRedemption ⇒ already redeemed.
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "You've already redeemed this code." },
        { status: 409 },
      );
    }
    console.error("[redeem] transaction failed", err);
    return NextResponse.json(
      { error: "Couldn't apply the code. Try again." },
      { status: 500 },
    );
  }
}
