import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRequestId, jsonWithRequestId } from "@/lib/requestTracing";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getRequestId(req);
  const session = await auth();

  if (!session?.user?.id) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    const project = await prisma.studioProject.findUnique({
      where: { id },
      include: { tracks: true },
    });

    if (!project) {
      return jsonWithRequestId(requestId, { error: "Project not found" }, { status: 404 });
    }

    if (project.userId !== session.user.id && !project.isPublic) {
      return jsonWithRequestId(requestId, { error: "Forbidden" }, { status: 403 });
    }

    return jsonWithRequestId(
      requestId,
      {
        ...project,
        tracks: project.tracks.map((t) => ({
          id: t.id,
          name: t.name,
          color: t.color,
          blobUrl: t.blobUrl,
          durationSec: t.durationSec,
        })),
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[studio/projects/[id]]", err);
    return jsonWithRequestId(
      requestId,
      { error: err instanceof Error ? err.message : "Failed to fetch project" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getRequestId(req);
  const session = await auth();

  if (!session?.user?.id) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = (await req.json()) as {
      name?: string;
      bpm?: number;
      patternJson?: any;
      trackCount?: number;
    };

    const project = await prisma.studioProject.findUnique({ where: { id } });

    if (!project) {
      return jsonWithRequestId(requestId, { error: "Project not found" }, { status: 404 });
    }

    if (project.userId !== session.user.id) {
      return jsonWithRequestId(requestId, { error: "Forbidden" }, { status: 403 });
    }

    const updated = await prisma.studioProject.update({
      where: { id },
      data: body,
    });

    return jsonWithRequestId(
      requestId,
      {
        id: updated.id,
        name: updated.name,
        bpm: updated.bpm,
        trackCount: updated.trackCount,
        updatedAt: updated.updatedAt,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[studio/projects/[id]]", err);
    return jsonWithRequestId(
      requestId,
      { error: err instanceof Error ? err.message : "Failed to update project" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getRequestId(req);
  const session = await auth();

  if (!session?.user?.id) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    const project = await prisma.studioProject.findUnique({ where: { id } });

    if (!project) {
      return jsonWithRequestId(requestId, { error: "Project not found" }, { status: 404 });
    }

    if (project.userId !== session.user.id) {
      return jsonWithRequestId(requestId, { error: "Forbidden" }, { status: 403 });
    }

    await prisma.studioProject.delete({ where: { id } });

    return jsonWithRequestId(requestId, { success: true }, { status: 204 });
  } catch (err) {
    console.error("[studio/projects/[id]]", err);
    return jsonWithRequestId(
      requestId,
      { error: err instanceof Error ? err.message : "Failed to delete project" },
      { status: 500 }
    );
  }
}
