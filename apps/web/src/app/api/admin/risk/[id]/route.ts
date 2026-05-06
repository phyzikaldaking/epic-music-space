import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@ems/db";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAdminIpAllowlist } from "@/lib/adminGuard";
import { ipFromRequest, logAdminAction } from "@/lib/adminAudit";

export const runtime = "nodejs";

const actionSchema = z.object({
  action: z.enum(["dismiss", "escalate", "flag_user", "suspend_user"]),
  note: z.string().max(500).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (checkAdminIpAllowlist(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { id } = await params;
  const event = await prisma.riskEvent.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const adminUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true },
  });
  const subjectUserId = event.actorUserId ?? event.targetUserId;
  const metadata =
    event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
      ? { ...(event.metadata as Record<string, unknown>) }
      : {};

  const status =
    parsed.data.action === "dismiss"
      ? "DISMISSED"
      : parsed.data.action === "escalate"
        ? "ESCALATED"
        : "ACTIONED";

  const updated = await prisma.$transaction(async (tx) => {
    if (parsed.data.action === "flag_user" && subjectUserId) {
      await tx.user.updateMany({
        where: { id: subjectUserId },
        data: {
          flaggedAt: new Date(),
          suspicionScore: { increment: event.severity === "CRITICAL" ? 40 : event.severity === "HIGH" ? 25 : 10 },
        },
      });
    }

    if (parsed.data.action === "suspend_user" && subjectUserId) {
      await tx.user.updateMany({
        where: { id: subjectUserId },
        data: {
          isSuspended: true,
          suspendedAt: new Date(),
          suspendedReason: parsed.data.note ?? `Risk event ${event.eventType}: ${event.reason ?? "manual suspension"}`,
          sessionsRevokedAt: new Date(),
          flaggedAt: new Date(),
        },
      });
    }

    return tx.riskEvent.update({
      where: { id },
      data: {
        status,
        severity: parsed.data.action === "escalate" && event.severity !== "CRITICAL" ? "HIGH" : event.severity,
        reviewedAt: new Date(),
        reviewedById: session.user.id,
        metadata: {
          ...metadata,
          adminAction: parsed.data.action,
          adminNote: parsed.data.note ?? null,
        } as Prisma.InputJsonObject,
      },
    });
  });

  await logAdminAction({
    adminId: session.user.id,
    adminEmail: adminUser?.email ?? session.user.email,
    action: `risk.${parsed.data.action}`,
    target: id,
    metadata: {
      eventType: event.eventType,
      subjectUserId,
      note: parsed.data.note,
    },
    ip: ipFromRequest(req),
  });

  return NextResponse.json({ event: updated });
}
