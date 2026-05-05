import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * GET  /api/admin/reports?status=PENDING|REVIEWED|DISMISSED|ACTIONED
 * PATCH /api/admin/reports  body: { id, status }
 *
 * Admin-only. Returns the moderation queue or transitions a single report
 * row's status (REVIEWED / DISMISSED / ACTIONED).
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
  status: z.enum(["REVIEWED", "DISMISSED", "ACTIONED"]),
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

  // ACTIONED is the "we agree, it's bad" terminal state — also unpublish
  // the reported post (if any) so it stops showing up in feeds. We don't
  // hard-delete so the audit trail and the moderator's decision survive.
  const existing = await prisma.userReport.findUnique({
    where: { id: parsed.data.id },
    select: { postId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.userReport.update({
      where: { id: parsed.data.id },
      data: { status: parsed.data.status, reviewedAt: new Date() },
      select: { id: true, status: true, reviewedAt: true, postId: true },
    });
    if (parsed.data.status === "ACTIONED" && existing.postId) {
      await tx.post.updateMany({
        where: { id: existing.postId, isPublished: true },
        data: { isPublished: false },
      });
      // Audit row for the implicit unpublish — separate from the status
      // change itself so each verb is independently filterable.
      await tx.moderationAction.create({
        data: {
          actorId: session.user.id,
          reportId: r.id,
          postId: existing.postId,
          action: "POST_UNPUBLISHED",
          metadata: { via: "report_actioned" },
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
    return r;
  });

  return NextResponse.json({ report: updated });
}
