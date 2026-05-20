import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { strictLimiter } from "@/lib/rateLimit";
import { readJsonBodyLimited } from "@/lib/apiHardening";
import { getRequestId, jsonWithRequestId, withRequestId } from "@/lib/requestTracing";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  isPublic: z.boolean().optional(),
  coverArtUrl: z.string().url().nullable().optional(),
  masterBlobUrl: z.string().url().nullable().optional(),
  isTemplate: z.boolean().optional(),
  templateGenre: z.string().max(40).nullable().optional(),
  // Template price in USD (#28). null = not for sale; 0 = free; >0 paid.
  // Cap at 999.99 to keep accidental zero-padding out of the marketplace.
  templatePriceUsd: z.number().min(0).max(999.99).nullable().optional(),
});

function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? Number(item) : item))) as T;
}

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
  const project = await prisma.studioProject.findFirst({
    where: { id, userId: session.user.id },
    include: {
      tracks: { orderBy: { position: "asc" } },
      clips: { orderBy: { startSec: "asc" } },
      audioFiles: { orderBy: { createdAt: "desc" }, include: { waveformPeaks: true } },
    },
  });
  if (!project) {
    return jsonWithRequestId(requestId, { error: "Not found" }, { status: 404 });
  }
  return jsonWithRequestId(
    requestId,
    jsonSafe({
      project,
      tracks: project.tracks,
      clips: project.clips,
      audioFiles: project.audioFiles,
    }),
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }

  try {
    await strictLimiter.consume(`studio:projects:patch:${session.user.id}`);
  } catch {
    return jsonWithRequestId(
      requestId,
      { error: "Too many writes — slow down." },
      { status: 429, headers: { "Retry-After": "30" } },
    );
  }

  const bodyResult = await readJsonBodyLimited<unknown>(req, {
    maxBytes: 32 * 1024,
    invalidMessage: "Expected JSON body",
  });
  if (!bodyResult.ok) return withRequestId(bodyResult.response, requestId);

  const parsed = patchSchema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return jsonWithRequestId(
      requestId,
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const { id } = await params;
  // Atomic ownership-scoped update. updateMany with userId in the where
  // clause means a foreign id never gets touched even if the row is
  // mutated between the check and the write (TOCTOU). Returns count = 0
  // when the project doesn't exist or isn't owned — same 404 either way
  // so we don't leak existence of others' rows.
  const result = await prisma.studioProject.updateMany({
    where: { id, userId: session.user.id },
    data: parsed.data,
  });
  if (result.count === 0) {
    return jsonWithRequestId(requestId, { error: "Not found" }, { status: 404 });
  }
  const updated = await prisma.studioProject.findUnique({ where: { id } });
  return jsonWithRequestId(requestId, jsonSafe({ project: updated }));
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  // Atomic ownership-scoped delete — same TOCTOU concern as PATCH above.
  // deleteMany returns count=0 when nothing matched; cascades clear
  // StudioTrack rows automatically. Vercel Blob cleanup is the separate
  // cleanup_studio_blobs sweeper.
  const result = await prisma.studioProject.deleteMany({
    where: { id, userId: session.user.id },
  });
  if (result.count === 0) {
    return jsonWithRequestId(requestId, { error: "Not found" }, { status: 404 });
  }
  return jsonWithRequestId(requestId, { ok: true });
}
