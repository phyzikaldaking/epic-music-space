import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRequestId, jsonWithRequestId } from "@/lib/requestTracing";

const modes = new Set(["edit", "record", "mix", "export"]);

async function canEdit(projectId: string, userId: string) {
  const project = await prisma.studioProject.findUnique({ where: { id: projectId }, select: { userId: true } });
  if (!project) return { ok: false, status: 404, error: "Project not found" };
  if (project.userId === userId) return { ok: true, status: 200 };
  const rows = await prisma.$queryRaw<Array<{ role: string }>>`
    select role from "StudioProjectCollaborator"
    where "projectId" = ${projectId} and "userId" = ${userId} and status = 'active' and role in ('editor','engineer','owner')
    limit 1
  `;
  return rows.length ? { ok: true, status: 200 } : { ok: false, status: 403, error: "Editor role required" };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const allowed = await canEdit(id, session.user.id);
  if (!allowed.ok) return jsonWithRequestId(requestId, { error: allowed.error }, { status: allowed.status });
  const rows = await prisma.$queryRaw`
    select * from "StudioProjectLock" where "projectId" = ${id} and "expiresAt" > current_timestamp limit 1
  `;
  return jsonWithRequestId(requestId, { lock: Array.isArray(rows) ? rows[0] ?? null : rows }, { status: 200 });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const allowed = await canEdit(id, session.user.id);
  if (!allowed.ok) return jsonWithRequestId(requestId, { error: allowed.error }, { status: allowed.status });
  const body = await req.json() as { clientId?: string; mode?: string; ttlSeconds?: number };
  if (!body.clientId) return jsonWithRequestId(requestId, { error: "clientId required" }, { status: 400 });
  const mode = modes.has(body.mode ?? "") ? body.mode! : "edit";
  const ttl = Math.max(15, Math.min(180, Number(body.ttlSeconds ?? 45)));

  const existing = await prisma.$queryRaw<Array<{ clientId: string; lockedById: string | null }>>`
    select "clientId", "lockedById" from "StudioProjectLock"
    where "projectId" = ${id} and "expiresAt" > current_timestamp
    limit 1
  `;
  const lock = existing[0];
  if (lock && lock.clientId !== body.clientId && lock.lockedById !== session.user.id) {
    return jsonWithRequestId(requestId, { error: "Project locked by another editor", lock }, { status: 409 });
  }

  const rows = await prisma.$queryRaw`
    insert into "StudioProjectLock" ("projectId", "lockedById", "clientId", mode, "expiresAt")
    values (${id}, ${session.user.id}, ${body.clientId}, ${mode}, current_timestamp + (${ttl} || ' seconds')::interval)
    on conflict ("projectId") do update set
      "lockedById" = excluded."lockedById",
      "clientId" = excluded."clientId",
      mode = excluded.mode,
      "expiresAt" = excluded."expiresAt",
      "updatedAt" = current_timestamp
    returning *
  `;
  return jsonWithRequestId(requestId, { lock: Array.isArray(rows) ? rows[0] : rows }, { status: 200 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const clientId = req.nextUrl.searchParams.get("clientId");
  await prisma.$executeRaw`
    delete from "StudioProjectLock"
    where "projectId" = ${id} and ("lockedById" = ${session.user.id} or "clientId" = ${clientId})
  `;
  return jsonWithRequestId(requestId, { success: true }, { status: 200 });
}
