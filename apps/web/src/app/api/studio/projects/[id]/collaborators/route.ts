import crypto from "crypto";
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRequestId, jsonWithRequestId } from "@/lib/requestTracing";

const roles = new Set(["viewer", "commenter", "editor", "engineer", "owner"]);

async function requireOwner(projectId: string, userId: string) {
  const project = await prisma.studioProject.findUnique({ where: { id: projectId }, select: { userId: true } });
  if (!project) return { ok: false, status: 404, error: "Project not found" };
  if (project.userId === userId) return { ok: true, status: 200 };
  const rows = await prisma.$queryRaw<Array<{ role: string }>>`
    select role from "StudioProjectCollaborator"
    where "projectId" = ${projectId} and "userId" = ${userId} and status = 'active' and role = 'owner'
    limit 1
  `;
  return rows.length ? { ok: true, status: 200 } : { ok: false, status: 403, error: "Owner role required" };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const allowed = await requireOwner(id, session.user.id);
  if (!allowed.ok) return jsonWithRequestId(requestId, { error: allowed.error }, { status: allowed.status });
  const collaborators = await prisma.$queryRaw`
    select id, "userId", "inviteEmail", role, status, "inviteToken", "acceptedAt", "createdAt", "updatedAt"
    from "StudioProjectCollaborator"
    where "projectId" = ${id}
    order by "createdAt" asc
  `;
  return jsonWithRequestId(requestId, { collaborators }, { status: 200 });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const allowed = await requireOwner(id, session.user.id);
  if (!allowed.ok) return jsonWithRequestId(requestId, { error: allowed.error }, { status: allowed.status });

  const body = await req.json() as { userId?: string; inviteEmail?: string; role?: string };
  const role = roles.has(body.role ?? "") ? body.role! : "viewer";
  const inviteToken = body.userId ? null : crypto.randomBytes(18).toString("hex");
  if (!body.userId && !body.inviteEmail) return jsonWithRequestId(requestId, { error: "userId or inviteEmail required" }, { status: 400 });

  const rows = await prisma.$queryRaw`
    insert into "StudioProjectCollaborator" ("projectId", "userId", "inviteEmail", "inviteToken", role, status, "createdById")
    values (${id}, ${body.userId ?? null}, ${body.inviteEmail ?? null}, ${inviteToken}, ${role}, ${body.userId ? "active" : "invited"}, ${session.user.id})
    on conflict do nothing
    returning id, "userId", "inviteEmail", "inviteToken", role, status, "createdAt"
  `;
  return jsonWithRequestId(requestId, { collaborator: Array.isArray(rows) ? rows[0] ?? null : rows }, { status: 201 });
}
