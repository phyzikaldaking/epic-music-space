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
  const project = await prisma.studioProject.findFirst({
    where: { id, userId: session.user.id },
    include: { tracks: { orderBy: { position: "asc" } } },
  });
  if (!project) {
    return jsonWithRequestId(requestId, { error: "Not found" }, { status: 404 });
  }
  return jsonWithRequestId(requestId, { project });
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
  // Ownership check before update so we don't leak existence of others' rows.
  const exists = await prisma.studioProject.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!exists) {
    return jsonWithRequestId(requestId, { error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.studioProject.update({
    where: { id },
    data: parsed.data,
  });
  return jsonWithRequestId(requestId, { project: updated });
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
  const exists = await prisma.studioProject.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!exists) {
    return jsonWithRequestId(requestId, { error: "Not found" }, { status: 404 });
  }

  await prisma.studioProject.delete({ where: { id } });
  // Note: blob deletion is best-effort and lives in a separate background
  // worker; we don't block the response on it. Prisma cascade clears
  // StudioTrack rows but Vercel Blob entries linger until the sweeper
  // runs. Tracked separately as cleanup_studio_blobs.
  return jsonWithRequestId(requestId, { ok: true });
}
