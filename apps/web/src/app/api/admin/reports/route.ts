import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * GET  /api/admin/reports?status=PENDING|SOFT_HOLD|APPEAL_PENDING|REVIEWED|DISMISSED|ACTIONED
 * PATCH /api/admin/reports  body: { id, status }
 *
 * Admin-only. Returns the moderation queue or transitions a single report
 * row's status (SOFT_HOLD / REVIEWED / DISMISSED / ACTIONED / APPEAL_PENDING).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "PENDING";
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));

  const reports = await prisma.userReport.findMany({
    where: { status },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      reporter: { select: { id: true, name: true, email: true } },
      reportedUser: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({ reports });
}

const patchSchema = z.object({
  id: z.string().cuid(),
  status: z.enum(["SOFT_HOLD", "REVIEWED", "DISMISSED", "ACTIONED", "APPEAL_PENDING"]),
});

export async function PATCH(req: NextRequest) {
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
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  // Two-lane moderation:
  //  - SOFT_HOLD: temporarily unpublish while fast human review runs.
  //  - ACTIONED : confirmed violation (terminal enforcement state).
  const existing = await prisma.userReport.findUnique({
    where: { id: parsed.data.id },
    select: { postId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Snapshot admin email for the audit row before the transaction — if the
  // admin user is later deleted we still want a useful audit trail.
  const adminUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true },
  });
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.userReport.update({
      where: { id: parsed.data.id },
      data: { status: parsed.data.status, reviewedAt: new Date() },
      select: { id: true, status: true, reviewedAt: true, postId: true },
    });
    if ((parsed.data.status === "SOFT_HOLD" || parsed.data.status === "ACTIONED") && existing.postId) {
      await tx.post.updateMany({
        where: { id: existing.postId, isPublished: true },
        data: { isPublished: false },
      });
      // Dual-write: ModerationAction (typed verb) + AdminActionLog (the
      // pane /admin/audit reads from). Each verb is independently
      // filterable on both surfaces.
      await tx.moderationAction.create({
        data: {
          actorId: session.user.id,
          reportId: r.id,
          postId: existing.postId,
          action: "POST_UNPUBLISHED",
          metadata: { via: parsed.data.status === "SOFT_HOLD" ? "report_soft_hold" : "report_actioned" },
        },
      });
      await tx.adminActionLog.create({
        data: {
          adminId: session.user.id,
          adminEmail: adminUser?.email ?? null,
          action: "post.unpublish",
          target: existing.postId,
          ip,
          metadata: {
            reportId: r.id,
            via: parsed.data.status === "SOFT_HOLD" ? "report_soft_hold" : "report_actioned",
          },
        },
      });
    }
    await tx.moderationAction.create({
      data: {
        actorId: session.user.id,
        reportId: r.id,
        postId: existing.postId ?? null,
        action: `REPORT_${parsed.data.status}`,
      },
    });
    await tx.adminActionLog.create({
      data: {
        adminId: session.user.id,
        adminEmail: adminUser?.email ?? null,
        action: `report.${parsed.data.status.toLowerCase()}`,
        target: r.id,
        ip,
        metadata: { postId: existing.postId },
      },
    });
    return r;
  });

  return NextResponse.json({ report: updated });
}
