import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRequestId, jsonWithRequestId } from "@/lib/requestTracing";

async function canAccess(projectId: string, userId: string, write = false) {
  const project = await prisma.studioProject.findUnique({ where: { id: projectId }, select: { id: true, userId: true, isPublic: true } });
  if (!project) return { ok: false, status: 404, error: "Project not found" };
  if (project.userId === userId) return { ok: true, status: 200, owner: true };
  const collaborators = await prisma.$queryRaw<Array<{ role: string; status: string }>>`
    select role, status from "StudioProjectCollaborator"
    where "projectId" = ${projectId} and "userId" = ${userId} and status = 'active'
    limit 1
  `;
  const role = collaborators[0]?.role;
  const writable = role === "editor" || role === "engineer" || role === "owner";
  if (role && (!write || writable)) return { ok: true, status: 200, owner: false, role };
  if (!write && project.isPublic) return { ok: true, status: 200, owner: false, role: "viewer" };
  return { ok: false, status: 403, error: "Forbidden" };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await canAccess(id, session.user.id);
  if (!access.ok) return jsonWithRequestId(requestId, { error: access.error }, { status: access.status });

  const [project, tracks, clips, audioFiles, collaborators, lock, exports] = await Promise.all([
    prisma.studioProject.findUnique({ where: { id }, select: { id: true, name: true, bpm: true, trackCount: true, patternJson: true, thumbnailPeaks: true, isPublic: true, masterBlobUrl: true, updatedAt: true } }),
    prisma.studioTrack.findMany({ where: { projectId: id }, orderBy: { position: "asc" } }),
    prisma.$queryRaw`select * from "StudioClip" where "projectId" = ${id} order by "startSec" asc`,
    prisma.$queryRaw`select * from "StudioAudioFile" where "projectId" = ${id} order by "createdAt" desc`,
    prisma.$queryRaw`select id, "userId", "inviteEmail", role, status, "createdAt", "acceptedAt" from "StudioProjectCollaborator" where "projectId" = ${id} order by "createdAt" asc`,
    prisma.$queryRaw`select * from "StudioProjectLock" where "projectId" = ${id} and "expiresAt" > current_timestamp limit 1`,
    prisma.$queryRaw`select * from "StudioExportJob" where "projectId" = ${id} order by "createdAt" desc limit 20`,
  ]);

  return jsonWithRequestId(requestId, { project, tracks, clips, audioFiles, collaborators, lock, exports }, { status: 200 });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await canAccess(id, session.user.id, true);
  if (!access.ok) return jsonWithRequestId(requestId, { error: access.error }, { status: access.status });

  const body = await req.json() as {
    name?: string;
    bpm?: number;
    patternJson?: unknown;
    trackCount?: number;
    thumbnailPeaks?: unknown;
    isPublic?: boolean;
    masterBlobUrl?: string | null;
  };

  const updated = await prisma.studioProject.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name.slice(0, 120) } : {}),
      ...(body.bpm !== undefined ? { bpm: Math.max(20, Math.min(300, Math.round(body.bpm))) } : {}),
      ...(body.patternJson !== undefined ? { patternJson: body.patternJson as object } : {}),
      ...(body.trackCount !== undefined ? { trackCount: Math.max(0, Math.round(body.trackCount)) } : {}),
      ...(body.thumbnailPeaks !== undefined ? { thumbnailPeaks: body.thumbnailPeaks as object } : {}),
      ...(body.isPublic !== undefined ? { isPublic: body.isPublic } : {}),
      ...(body.masterBlobUrl !== undefined ? { masterBlobUrl: body.masterBlobUrl } : {}),
    },
  });

  await prisma.studioProjectVersion.create({
    data: {
      projectId: id,
      patternJson: (body.patternJson ?? updated.patternJson ?? {}) as object,
      bpm: updated.bpm,
      trackCount: updated.trackCount,
      label: "Autosave",
    },
  }).catch(() => undefined);

  return jsonWithRequestId(requestId, { project: updated }, { status: 200 });
}
