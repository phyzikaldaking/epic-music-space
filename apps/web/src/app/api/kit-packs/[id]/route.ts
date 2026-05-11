import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readJsonBodyLimited } from "@/lib/apiHardening";
import { getRequestId, jsonWithRequestId, withRequestId } from "@/lib/requestTracing";

// Single-pack ops (#29). GET returns the full pack incl. samples.
// PATCH flips isPublic (publish toggle) or updates pack metadata —
// only the author can do either. POST `download` bumps the
// downloadCount + returns the samples manifest for the studio to load.

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(1000).nullable().optional(),
  genre: z.string().max(40).nullable().optional(),
  bpm: z.number().int().min(40).max(240).nullable().optional(),
  coverUrl: z.string().url().nullable().optional(),
  isPublic: z.boolean().optional(),
  priceUsd: z.number().min(0).max(999.99).nullable().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req);
  const { id } = await params;
  const pack = await prisma.drumKitPack.findFirst({
    // Public packs are readable by anyone. Drafts are author-only.
    where: { id },
    include: { author: { select: { id: true, name: true } } },
  });
  if (!pack) {
    return jsonWithRequestId(requestId, { error: "Not found" }, { status: 404 });
  }
  if (!pack.isPublic) {
    const session = await auth();
    if (!session?.user?.id || session.user.id !== pack.authorId) {
      return jsonWithRequestId(requestId, { error: "Not found" }, { status: 404 });
    }
  }
  return jsonWithRequestId(requestId, { pack });
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
  const bodyResult = await readJsonBodyLimited<unknown>(req, {
    maxBytes: 16 * 1024,
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
  // Ownership-scoped update — updateMany returns 0 when the row doesn't
  // exist or isn't owned, which we surface as a 404 (don't leak existence).
  const result = await prisma.drumKitPack.updateMany({
    where: { id, authorId: session.user.id },
    data: parsed.data,
  });
  if (result.count === 0) {
    return jsonWithRequestId(requestId, { error: "Not found" }, { status: 404 });
  }
  const updated = await prisma.drumKitPack.findUnique({ where: { id } });
  return jsonWithRequestId(requestId, { pack: updated });
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
  const result = await prisma.drumKitPack.deleteMany({
    where: { id, authorId: session.user.id },
  });
  if (result.count === 0) {
    return jsonWithRequestId(requestId, { error: "Not found" }, { status: 404 });
  }
  return jsonWithRequestId(requestId, { ok: true });
}
