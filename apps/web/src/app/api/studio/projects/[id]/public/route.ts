import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRequestId, jsonWithRequestId } from "@/lib/requestTracing";

/**
 * Get public project data for read-only listening page
 * No auth required — project must be public
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getRequestId(req);

  try {
    const { id } = await params;

    const project = await prisma.studioProject.findUnique({
      where: { id },
      include: { tracks: true },
    });

    if (!project || !project.isPublic) {
      return jsonWithRequestId(
        requestId,
        { error: "Project not found or is private" },
        { status: 404 }
      );
    }

    return jsonWithRequestId(
      requestId,
      {
        id: project.id,
        name: project.name,
        bpm: project.bpm,
        masterBlobUrl: project.masterBlobUrl,
        tracks: project.tracks.map((t) => ({
          id: t.id,
          name: t.name,
          blobUrl: t.blobUrl,
          durationSec: t.durationSec,
        })),
        createdAt: project.createdAt,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[studio/projects/[id]/public]", err);
    return jsonWithRequestId(
      requestId,
      { error: err instanceof Error ? err.message : "Failed to fetch project" },
      { status: 500 }
    );
  }
}
