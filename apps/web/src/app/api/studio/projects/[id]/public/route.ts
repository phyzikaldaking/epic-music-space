import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRequestId, jsonWithRequestId } from "@/lib/requestTracing";

// Read-only public-share endpoint (#9). Returns the project only when
// owner has flipped isPublic = true; otherwise 404 — never 403, so we
// don't even confirm the project exists to unauthorized requesters.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req);
  const { id } = await params;

  const project = await prisma.studioProject.findFirst({
    where: { id, isPublic: true },
    select: {
      id: true,
      name: true,
      bpm: true,
      trackCount: true,
      thumbnailPeaks: true,
      coverArtUrl: true,
      masterBlobUrl: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { name: true, image: true } },
      tracks: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          name: true,
          color: true,
          blobUrl: true,
          durationSec: true,
          position: true,
        },
      },
    },
  });

  if (!project) {
    return jsonWithRequestId(requestId, { error: "Not found" }, { status: 404 });
  }
  return jsonWithRequestId(requestId, { project });
}
