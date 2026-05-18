import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRequestId, jsonWithRequestId } from "@/lib/requestTracing";

const presets = new Set(["mp3_demo", "wav_master", "stems", "social_preview", "session_archive"]);

async function canExport(projectId: string, userId: string) {
  const project = await prisma.studioProject.findUnique({ where: { id: projectId }, select: { userId: true } });
  if (!project) return { ok: false, status: 404, error: "Project not found" };
  if (project.userId === userId) return { ok: true, status: 200 };
  const rows = await prisma.$queryRaw<Array<{ role: string }>>`
    select role from "StudioProjectCollaborator"
    where "projectId" = ${projectId} and "userId" = ${userId} and status = 'active' and role in ('engineer','owner')
    limit 1
  `;
  return rows.length ? { ok: true, status: 200 } : { ok: false, status: 403, error: "Engineer or owner role required" };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const allowed = await canExport(id, session.user.id);
  if (!allowed.ok) return jsonWithRequestId(requestId, { error: allowed.error }, { status: allowed.status });
  const jobs = await prisma.$queryRaw`
    select * from "StudioExportJob" where "projectId" = ${id} order by "createdAt" desc limit 50
  `;
  return jsonWithRequestId(requestId, { jobs }, { status: 200 });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const allowed = await canExport(id, session.user.id);
  if (!allowed.ok) return jsonWithRequestId(requestId, { error: allowed.error }, { status: allowed.status });
  const body = await req.json() as { preset?: string; metadata?: unknown };
  const preset = presets.has(body.preset ?? "") ? body.preset! : "wav_master";
  const rows = await prisma.$queryRaw`
    insert into "StudioExportJob" ("projectId", "requestedById", preset, metadata)
    values (${id}, ${session.user.id}, ${preset}, ${JSON.stringify(body.metadata ?? {})}::jsonb)
    returning *
  `;
  return jsonWithRequestId(requestId, { job: Array.isArray(rows) ? rows[0] : rows }, { status: 201 });
}
