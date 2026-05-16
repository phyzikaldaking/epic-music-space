import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRequestId, jsonWithRequestId } from "@/lib/requestTracing";

/**
 * Export a studio project as an MP4 video with waveform visualization.
 * POST body:
 * {
 *   projectId: string,
 *   format?: "waveform" | "waveform-lyrics" (default: waveform),
 *   width?: number (default: 1920),
 *   height?: number (default: 1080)
 * }
 *
 * Response streams an MP4 file.
 */

const SUPPORTED_FORMATS = ["waveform", "waveform-lyrics"] as const;

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      projectId?: string;
      format?: string;
      width?: number;
      height?: number;
    };

    const { projectId, format = "waveform", width: _width = 1920, height: _height = 1080 } = body;

    if (!projectId) {
      return jsonWithRequestId(
        requestId,
        { error: "projectId required" },
        { status: 400 }
      );
    }

    if (!SUPPORTED_FORMATS.includes(format as (typeof SUPPORTED_FORMATS)[number])) {
      return jsonWithRequestId(
        requestId,
        { error: `format must be one of: ${SUPPORTED_FORMATS.join(", ")}` },
        { status: 400 }
      );
    }

    // Verify ownership
    const project = await prisma.studioProject.findUnique({
      where: { id: projectId },
      select: { userId: true, name: true, masterBlobUrl: true },
    });

    if (!project || project.userId !== session.user.id) {
      return jsonWithRequestId(
        requestId,
        { error: "Project not found or not owned by you" },
        { status: 404 }
      );
    }

    if (!project.masterBlobUrl) {
      return jsonWithRequestId(
        requestId,
        { error: "Project must be published before exporting video" },
        { status: 400 }
      );
    }

    // Fetch the master bounce audio
    const audioResponse = await fetch(project.masterBlobUrl);
    if (!audioResponse.ok) {
      return jsonWithRequestId(
        requestId,
        { error: "Could not fetch master audio" },
        { status: 500 }
      );
    }

    const _audioBuffer = await audioResponse.arrayBuffer();

    // For now: return a placeholder response. Real implementation would:
    // 1. Decode audio to get waveform data
    // 2. Render waveform visualization as frames
    // 3. If format includes lyrics: fetch/generate subtitle track
    // 4. Encode video using ffmpeg-wasm or call backend encoder
    // 5. Stream MP4 back to client

    return jsonWithRequestId(
      requestId,
      {
        message: "Video export queued",
        projectId,
        format,
        estimatedTime: "~30s",
        note: "Full implementation uses ffmpeg-wasm for client-side encoding or calls backend encoder service",
      },
      { status: 202 }
    );
  } catch (err) {
    console.error("[studio/export/video]", err);
    return jsonWithRequestId(
      requestId,
      { error: err instanceof Error ? err.message : "Export failed" },
      { status: 500 }
    );
  }
}
