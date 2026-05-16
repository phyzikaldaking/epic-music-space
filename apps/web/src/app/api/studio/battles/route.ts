import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRequestId, jsonWithRequestId } from "@/lib/requestTracing";

/**
 * Create a new producer battle session
 * POST body: { sampleId, sampleName, durationSeconds }
 */

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const session = await auth();

  if (!session?.user?.id) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      sampleId?: string;
      sampleName?: string;
      durationSeconds?: number;
    };

    const { sampleId = "default", sampleName = "Battle Sample", durationSeconds = 180 } = body;

    if (!sampleId) {
      return jsonWithRequestId(
        requestId,
        { error: "sampleId required" },
        { status: 400 }
      );
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const battleSession = await prisma.battleSession.create({
      data: {
        sampleId,
        sampleName,
        durationSeconds,
        expiresAt,
      },
    });

    return jsonWithRequestId(
      requestId,
      {
        id: battleSession.id,
        sampleId: battleSession.sampleId,
        sampleName: battleSession.sampleName,
        durationSeconds: battleSession.durationSeconds,
        createdAt: battleSession.createdAt,
        expiresAt: battleSession.expiresAt,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[studio/battles]", err);
    return jsonWithRequestId(
      requestId,
      { error: err instanceof Error ? err.message : "Battle creation failed" },
      { status: 500 }
    );
  }
}

/**
 * List active battle sessions
 */
export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);

  try {
    const sessions = await prisma.battleSession.findMany({
      where: {
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 20,
    });

    return jsonWithRequestId(
      requestId,
      {
        sessions: sessions.map((s) => ({
          id: s.id,
          sampleId: s.sampleId,
          sampleName: s.sampleName,
          durationSeconds: s.durationSeconds,
          createdAt: s.createdAt,
          expiresAt: s.expiresAt,
        })),
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[studio/battles]", err);
    return jsonWithRequestId(
      requestId,
      { error: err instanceof Error ? err.message : "Failed to fetch battles" },
      { status: 500 }
    );
  }
}
