import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRequestId, jsonWithRequestId } from "@/lib/requestTracing";

/**
 * Create a new live jam session
 * POST body: { projectId, sessionName }
 */

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const session = await auth();

  if (!session?.user?.id) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      projectId?: string;
      sessionName?: string;
    };

    const { projectId, sessionName = "Jam Session" } = body;

    if (!projectId) {
      return jsonWithRequestId(
        requestId,
        { error: "projectId required" },
        { status: 400 }
      );
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const jamSession = await prisma.jamSession.create({
      data: {
        projectId,
        name: sessionName,
        isLive: true,
        expiresAt,
        participants: {
          create: {
            userId: session.user.id,
            userName: session.user.name || "Collaborator",
            isPlaying: true,
          },
        },
      },
      include: {
        participants: true,
      },
    });

    return jsonWithRequestId(
      requestId,
      {
        id: jamSession.id,
        name: jamSession.name,
        projectId: jamSession.projectId,
        participants: jamSession.participants.map((p) => ({
          userId: p.userId,
          userName: p.userName,
          isPlaying: p.isPlaying,
          lastBeatTime: p.lastBeatTime,
        })),
        isLive: jamSession.isLive,
        createdAt: jamSession.createdAt,
        expiresAt: jamSession.expiresAt,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[jam/create]", err);
    return jsonWithRequestId(
      requestId,
      { error: err instanceof Error ? err.message : "Session creation failed" },
      { status: 500 }
    );
  }
}
