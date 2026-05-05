import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const KNOWN_TYPES = [
  "POST_LIKED",
  "POST_COMMENTED",
  "FOLLOWED_POST",
  "FOLLOW",
  "LICENSE_SOLD",
  "PAYOUT",
  "TIP",
  "VERSUS_RESULT",
  "AUCTION_BID_RECEIVED",
  "AUCTION_OUTBID",
] as const;
type KnownType = (typeof KNOWN_TYPES)[number];

const patchSchema = z.object({
  type: z.enum(KNOWN_TYPES),
  inApp: z.boolean().optional(),
  email: z.boolean().optional(),
});

/**
 * GET /api/notifications/preferences
 *   Returns the current overrides. Missing rows default to enabled, so the
 *   client treats undefined as "on".
 *
 * PATCH /api/notifications/preferences
 *   Body: { type, inApp?, email? } — upserts a single override row.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rows = await prisma.notificationPreference.findMany({
    where: { userId: session.user.id },
    select: { type: true, inApp: true, email: true },
  });
  return NextResponse.json({ preferences: rows });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const { type, inApp, email } = parsed.data;

  const existing = await prisma.notificationPreference.findUnique({
    where: { userId_type: { userId: session.user.id, type } },
    select: { inApp: true, email: true },
  });
  const data = {
    inApp: inApp ?? existing?.inApp ?? true,
    email: email ?? existing?.email ?? true,
  };

  const updated = await prisma.notificationPreference.upsert({
    where: { userId_type: { userId: session.user.id, type } },
    create: { userId: session.user.id, type, ...data },
    update: data,
    select: { type: true, inApp: true, email: true },
  });

  return NextResponse.json({ preference: updated });
}

export type NotificationType = KnownType;
