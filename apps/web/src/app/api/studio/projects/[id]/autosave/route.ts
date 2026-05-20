import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@ems/db";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readJsonBodyLimited } from "@/lib/apiHardening";
import { getRequestId, jsonWithRequestId, withRequestId } from "@/lib/requestTracing";

const autosaveSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  bpm: z.number().int().min(20).max(300).optional(),
  patternJson: z.unknown().optional(),
  trackCount: z.number().int().min(0).max(128).optional(),
  thumbnailPeaks: z.array(z.number().min(0).max(1)).max(120).optional(),
});

async function canAutosave(projectId: string, userId: string) {
  const project = await prisma.studioProject.findUnique({ where: { id: projectId }, select: { userId: true } });
  if (!project) return { ok: false as const, status: 404, error: "Project not found" };
  if (project.userId === userId) return { ok: true as const };
  const rows = await prisma.$queryRaw<Array<{ role: string }>>`
    select role from "StudioProjectCollaborator"
    where "projectId" = ${projectId} and "userId" = ${userId} and status = 'active' and role in ('editor','engineer','owner')
    limit 1
  `;
  return rows.length ? { ok: true as const } : { ok: false as const, status: 403, error: "Editor role required" };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await canAutosave(id, session.user.id);
  if (!access.ok) return jsonWithRequestId(requestId, { error: access.error }, { status: access.status });

  const bodyResult = await readJsonBodyLimited<unknown>(req, {
    maxBytes: 1024 * 1024,
    invalidMessage: "Expected JSON body",
  });
  if (!bodyResult.ok) return withRequestId(bodyResult.response, requestId);

  const parsed = autosaveSchema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return jsonWithRequestId(
      requestId,
      { error: parsed.error.issues[0]?.message ?? "Invalid autosave body" },
      { status: 400 },
    );
  }

  const body = parsed.data;
  const updated = await prisma.studioProject.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.bpm !== undefined ? { bpm: body.bpm } : {}),
      ...(body.patternJson !== undefined ? { patternJson: body.patternJson as Prisma.InputJsonValue } : {}),
      ...(body.trackCount !== undefined ? { trackCount: body.trackCount } : {}),
      ...(body.thumbnailPeaks !== undefined ? { thumbnailPeaks: body.thumbnailPeaks as Prisma.InputJsonValue } : {}),
    },
  });

  const version = await prisma.studioProjectVersion.create({
    data: {
      projectId: id,
      patternJson: (body.patternJson ?? updated.patternJson ?? {}) as Prisma.InputJsonValue,
      bpm: updated.bpm,
      trackCount: updated.trackCount,
      label: "Autosave",
    },
  });

  return jsonWithRequestId(requestId, { ok: true, project: updated, version }, { status: 200 });
}

export const PUT = POST;
