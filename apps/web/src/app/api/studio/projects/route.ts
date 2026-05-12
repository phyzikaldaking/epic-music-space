import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRequestId, jsonWithRequestId } from "@/lib/requestTracing";

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  const session = await auth();

  if (!session?.user?.id) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }

  try {
    const projects = await prisma.studioProject.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        name: true,
        bpm: true,
        trackCount: true,
        createdAt: true,
        updatedAt: true,
        thumbnailPeaks: true,
      },
    });

    return jsonWithRequestId(requestId, { projects }, { status: 200 });
  } catch (err) {
    console.error("[studio/projects]", err);
    return jsonWithRequestId(
      requestId,
      { error: err instanceof Error ? err.message : "Failed to fetch projects" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const session = await auth();

  if (!session?.user?.id) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      name?: string;
      bpm?: number;
      patternJson?: any;
      trackCount?: number;
    };

    const { name = "Untitled Project", bpm = 120, patternJson, trackCount = 0 } = body;

    const project = await prisma.studioProject.create({
      data: {
        userId: session.user.id,
        name,
        bpm,
        patternJson,
        trackCount,
      },
    });

    return jsonWithRequestId(
      requestId,
      {
        id: project.id,
        name: project.name,
        bpm: project.bpm,
        trackCount: project.trackCount,
        createdAt: project.createdAt,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[studio/projects]", err);
    return jsonWithRequestId(
      requestId,
      { error: err instanceof Error ? err.message : "Failed to create project" },
      { status: 500 }
    );
  }
}
