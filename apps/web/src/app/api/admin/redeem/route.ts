import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return null;
  if (session.user.role !== "ADMIN") return null;
  return session;
}

const mintSchema = z.object({
  // Optional explicit code; otherwise we generate one. Useful for
  // launch giveaways where the code is part of the marketing copy.
  code: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[A-Z0-9-]+$/, "Code may only contain A-Z, 0-9, and hyphens")
    .optional(),
  // Generate this many random codes in one batch. Mutually exclusive
  // with `code`.
  count: z.number().int().min(1).max(500).optional(),
  // Reward shape — must grant at least one thing.
  reward: z
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
    ),
  maxUses: z.number().int().min(1).max(1_000_000).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  description: z.string().max(500).optional(),
});

function generateCode() {
  // 6 base32 chars (A-Z + digits without easily-confused 0/O/1/I)
  // ⇒ ~30 bits of entropy. Plenty for non-targeted brute-force resistance
  // when paired with the strict per-IP rate limiter on /api/redeem.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(6);
  let suffix = "";
  for (const b of bytes) suffix += alphabet[b % alphabet.length];
  return `EMS-${suffix}`;
}

/**
 * GET /api/admin/redeem
 * List recent codes. Most-recent-first, with redeem counts.
 */
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const codes = await prisma.redeemCode.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    codes: codes.map((c) => ({
      id: c.id,
      code: c.code,
      reward: c.reward,
      maxUses: c.maxUses,
      uses: c.uses,
      expiresAt: c.expiresAt,
      description: c.description,
      frozenAt: c.frozenAt,
      createdAt: c.createdAt,
    })),
  });
}

/**
 * POST /api/admin/redeem
 * Mint one or many codes. Returns the codes so the admin can copy
 * them straight out of the response.
 */
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = mintSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  if (parsed.data.code && parsed.data.count) {
    return NextResponse.json(
      { error: "Pass either `code` (single, explicit) or `count` (batch generated), not both." },
      { status: 400 },
    );
  }

  const explicit = parsed.data.code?.trim().toUpperCase();
  const batchCount = parsed.data.count ?? (explicit ? 0 : 1);
  const codesToInsert: string[] = explicit ? [explicit] : [];
  for (let i = 0; i < batchCount; i++) codesToInsert.push(generateCode());

  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  const reward = parsed.data.reward;
  const maxUses = parsed.data.maxUses ?? null;
  const description = parsed.data.description ?? null;

  // createMany with skipDuplicates lets a colliding random code get
  // silently dropped without aborting the batch. Caller can re-run
  // with the missing count if they care.
  const inserted = await prisma.redeemCode.createMany({
    data: codesToInsert.map((code) => ({
      code,
      reward,
      maxUses,
      expiresAt,
      description,
      createdById: session.user!.id,
    })),
    skipDuplicates: true,
  });

  return NextResponse.json({
    requested: codesToInsert.length,
    inserted: inserted.count,
    codes: codesToInsert,
  });
}
