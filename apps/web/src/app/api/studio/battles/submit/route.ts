import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRequestId, jsonWithRequestId } from "@/lib/requestTracing";
import { uploadAudioBlob } from "@/lib/blobClient";

/**
 * Submit a producer's mix to a battle
 * POST multipart/form-data: { audio: Blob, sessionId: string }
 */

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const session = await auth();

  if (!session?.user?.id) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const audio = formData.get("audio") as File;
    const sessionId = formData.get("sessionId") as string;

    if (!audio || !sessionId) {
      return jsonWithRequestId(
        requestId,
        { error: "audio and sessionId required" },
        { status: 400 }
      );
    }

    // Validate audio file size (max 50MB)
    if (audio.size > 50 * 1024 * 1024) {
      return jsonWithRequestId(
        requestId,
        { error: "Audio file too large (max 50MB)" },
        { status: 413 }
      );
    }

    // Verify session exists
    const battleSession = await prisma.battleSession.findUnique({
      where: { id: sessionId },
    });

    if (!battleSession) {
      return jsonWithRequestId(
        requestId,
        { error: "Battle session not found" },
        { status: 404 }
      );
    }

    // Upload audio to Vercel Blob
    const wavBlobUrl = await uploadAudioBlob(audio, `battles/${sessionId}`);

    const durationSec = Math.round(audio.size / (44100 * 2 * 2)); // Estimate for 44.1kHz stereo

    const entry = await prisma.battleEntry.create({
      data: {
        sessionId,
        userId: session.user.id,
        wavBlobUrl,
        duration: durationSec,
      },
    });

    return jsonWithRequestId(
      requestId,
      {
        id: entry.id,
        sessionId: entry.sessionId,
        userId: entry.userId,
        submittedAt: entry.submittedAt,
        votes: entry.votes,
        wavBlobUrl: entry.wavBlobUrl,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[studio/battles/submit]", err);
    return jsonWithRequestId(
      requestId,
      { error: err instanceof Error ? err.message : "Submission failed" },
      { status: 500 }
    );
  }
}
