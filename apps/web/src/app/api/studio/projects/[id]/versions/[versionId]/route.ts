import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRequestId, jsonWithRequestId } from "@/lib/requestTracing";

// Single-version GET — loads the full patternJson so the client can
// hydrate the engine. DELETE removes a single snapshot from the rolling
// history.

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }
  const { id, versionId } = await params;
  // Single query — JOIN through the project's userId to enforce ownership.
  const version = await prisma.studioProjectVersion.findFirst({
    where: {
      id: versionId,
      project: { id, userId: session.user.id },
    },
  });
  if (!version) {
    return jsonWithRequestId(requestId, { error: "Not found" }, { status: 404 });
  }
  return jsonWithRequestId(requestId, { version });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }
  const { id, versionId } = await params;
  // deleteMany with the ownership-scoped where clause is atomic; returns
  // count=0 when the version doesn't exist or isn't owned (same 404).
  const result = await prisma.studioProjectVersion.deleteMany({
    where: {
      id: versionId,
      project: { id, userId: session.user.id },
    },
  });
  if (result.count === 0) {
    return jsonWithRequestId(requestId, { error: "Not found" }, { status: 404 });
  }
  return jsonWithRequestId(requestId, { ok: true });
}
