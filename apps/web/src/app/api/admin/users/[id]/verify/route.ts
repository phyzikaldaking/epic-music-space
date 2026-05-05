import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const bodySchema = z.object({ verified: z.boolean() });

/**
 * POST /api/admin/users/[id]/verify  body: { verified: boolean }
 *
 * Admin-only toggle for the verified-artist badge. Records verifiedAt on
 * grant, clears it on revoke. The badge surfaces on PostCard, Studio,
 * and any UserChip used in the timeline.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { id } = await params;
  const adminUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true },
  });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const [updated] = await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: {
        isVerified: parsed.data.verified,
        verifiedAt: parsed.data.verified ? new Date() : null,
      },
      select: { id: true, isVerified: true, verifiedAt: true },
    }),
    prisma.moderationAction.create({
      data: {
        actorId: session.user.id,
        subjectUserId: id,
        action: parsed.data.verified ? "USER_VERIFIED" : "USER_UNVERIFIED",
      },
    }),
    // Dual-write into the pane /admin/audit reads from so verified-badge
    // toggles surface alongside other admin actions.
    prisma.adminActionLog.create({
      data: {
        adminId: session.user.id,
        adminEmail: adminUser?.email ?? null,
        action: parsed.data.verified ? "user.verify" : "user.unverify",
        target: id,
        ip,
      },
    }),
  ]);

  return NextResponse.json({ user: updated });
}
