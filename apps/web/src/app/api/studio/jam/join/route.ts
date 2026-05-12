import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRequestId, jsonWithRequestId } from "@/lib/requestTracing";

/**
 * Join an existing jam session
 * POST body: { sessionId }
 */

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const session = await auth();

  if (!session?.user?.id) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      sessionId?: string;
    };

    const { sessionId } = body;

    if (!sessionId) {
      return jsonWithRequestId(
        requestId,
        { error: "sessionId required" },
        { status: 400 }
      );
    }

    const jamSession = await prisma.jamSession.findUnique({
      where: { id: sessionId },
      include: { participants: true },
    });

    if (!jamSession) {
      return jsonWithRequestId(
        requestId,
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Check if already joined
    const existing = jamSession.participants.find((p) => p.userId === session.user.id);

    if (!existing) {
      await prisma.jamParticipant.create({
        data: {
          sessionId,
          userId: session.user.id,
          userName: session.user.name || "Collaborator",
          isPlaying: false,
        },
      });
    }

    const updated = await prisma.jamSession.findUnique({
      where: { id: sessionId },
      include: { participants: true },
    });

    return jsonWithRequestId(
      requestId,
      {
        id: updated!.id,
        name: updated!.name,
        projectId: updated!.projectId,
        participants: updated!.participants.map((p) => ({
          userId: p.userId,
          userName: p.userName,
          isPlaying: p.isPlaying,
          lastBeatTime: p.lastBeatTime,
        })),
        isLive: updated!.isLive,
        createdAt: updated!.createdAt,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[jam/join]", err);
    return jsonWithRequestId(
      requestId,
      { error: err instanceof Error ? err.message : "Join failed" },
      { status: 500 }
    );
  }
}
