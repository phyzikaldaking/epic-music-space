import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAdminAction, ipFromRequest } from "@/lib/adminAudit";
import { checkAdminIpAllowlist } from "@/lib/adminGuard";

export const runtime = "nodejs";

async function requireAdmin(req: NextRequest) {
  if (checkAdminIpAllowlist(req)) return null;
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") return null;
  return session;
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(2000).optional(),
  severity: z.enum(["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"]).default("INVESTIGATING"),
});

const patchSchema = z.object({
  id: z.string().cuid(),
  title: z.string().min(1).max(200).optional(),
  body: z.string().max(2000).optional(),
  severity: z.enum(["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"]).optional(),
  resolved: z.boolean().optional(),
});

export async function GET() {
  // Public: anyone can read active incidents (the /status page calls this).
  const active = await prisma.statusIncident.findMany({
    where: { resolvedAt: null },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  return NextResponse.json({ incidents: active });
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const incident = await prisma.statusIncident.create({
    data: { ...parsed.data, createdById: session.user.id },
  });

  await logAdminAction({
    adminId: session.user.id,
    adminEmail: session.user.email,
    action: "incident.create",
    target: incident.id,
    metadata: { title: incident.title, severity: incident.severity },
    ip: ipFromRequest(req),
  });

  return NextResponse.json({ incident }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { id, resolved, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (resolved === true) {
    data.resolvedAt = new Date();
    data.severity = "RESOLVED";
  } else if (resolved === false) {
    data.resolvedAt = null;
  }

  const incident = await prisma.statusIncident.update({ where: { id }, data });

  await logAdminAction({
    adminId: session.user.id,
    adminEmail: session.user.email,
    action: resolved ? "incident.resolve" : "incident.update",
    target: id,
    ip: ipFromRequest(req),
  });

  return NextResponse.json({ incident });
}
