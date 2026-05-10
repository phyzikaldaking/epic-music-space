import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { strictLimiter } from "@/lib/rateLimit";
import { readJsonBodyLimited } from "@/lib/apiHardening";
import {
  getRequestId,
  jsonWithRequestId,
  withRequestId,
} from "@/lib/requestTracing";

// Server-side version history (#20). Each StudioProject keeps a rolling
// window of the last 10 snapshots. POST captures a new one; GET lists
// the metadata so the version-history modal can render the diff
// (BPM / track count / pattern fingerprint). DELETE clears a single
// snapshot. Patterns + transport live in patternJson — track audio
// blobs are not duplicated. Restoring a version hydrates the engine
// but keeps the current track audio.

const MAX_VERSIONS_PER_PROJECT = 10;

const postSchema = z.object({
  patternJson: z.unknown(),
  bpm: z.number().int().min(40).max(240).optional().default(120),
  trackCount: z.number().int().min(0).max(64).optional().default(0),
  label: z.string().min(1).max(80).nullable().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  // Ownership check — only the project owner sees its versions.
  const project = await prisma.studioProject.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!project) {
    return jsonWithRequestId(requestId, { error: "Not found" }, { status: 404 });
  }
  const versions = await prisma.studioProjectVersion.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      bpm: true,
      trackCount: true,
      label: true,
      createdAt: true,
    },
    take: MAX_VERSIONS_PER_PROJECT,
  });
  return jsonWithRequestId(requestId, { versions });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }
  try {
    await strictLimiter.consume(`studio:versions:${session.user.id}`);
  } catch {
    return jsonWithRequestId(
      requestId,
      { error: "Too many version saves — slow down." },
      { status: 429, headers: { "Retry-After": "30" } },
    );
  }
  const bodyResult = await readJsonBodyLimited<unknown>(req, {
    // patternJson can be a few KB — give it headroom but cap it so a
    // bug in the client doesn't fill the DB row by row.
    maxBytes: 256 * 1024,
    invalidMessage: "Expected JSON body",
  });
  if (!bodyResult.ok) return withRequestId(bodyResult.response, requestId);
  const parsed = postSchema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return jsonWithRequestId(
      requestId,
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }
  const { id } = await params;
  const project = await prisma.studioProject.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!project) {
    return jsonWithRequestId(requestId, { error: "Not found" }, { status: 404 });
  }
  const created = await prisma.studioProjectVersion.create({
    data: {
      projectId: id,
      // Prisma's Json type accepts unknown; we already capped the body
      // size above so the JSON payload is bounded.
      patternJson: parsed.data.patternJson as object,
      bpm: parsed.data.bpm,
      trackCount: parsed.data.trackCount,
      label: parsed.data.label ?? null,
    },
    select: {
      id: true,
      bpm: true,
      trackCount: true,
      label: true,
      createdAt: true,
    },
  });
  // FIFO evict — keep the latest MAX_VERSIONS_PER_PROJECT only. Cheap
  // because we just inserted; the count query reads the index.
  const total = await prisma.studioProjectVersion.count({ where: { projectId: id } });
  if (total > MAX_VERSIONS_PER_PROJECT) {
    const overage = total - MAX_VERSIONS_PER_PROJECT;
    const oldest = await prisma.studioProjectVersion.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "asc" },
      take: overage,
      select: { id: true },
    });
    if (oldest.length > 0) {
      await prisma.studioProjectVersion.deleteMany({
        where: { id: { in: oldest.map((v) => v.id) } },
      });
    }
  }
  return jsonWithRequestId(requestId, { version: created });
}
