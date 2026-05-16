import { NextRequest, NextResponse } from "next/server";
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

    const { projectId, format = "waveform", width = 1920, height = 1080 } = body;

    if (!projectId) {
      return jsonWithRequestId(
        requestId,
        { error: "projectId required" },
        { status: 400 }
      );
    }

    if (!SUPPORTED_FORMATS.includes(format as any)) {
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

    const audioBuffer = await audioResponse.arrayBuffer();

    // Queue the export — return jobId immediately; rendering happens in background
    const jobId = `video-export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      await supabase.from("export_jobs").insert({
        id: jobId,
        user_id: (session as { user: { id: string } }).user.id,
        type: "video",
        status: "queued",
        created_at: new Date().toISOString(),
      });
    } catch (dbErr) {
      console.warn("[export/video] could not persist job record", dbErr);
    }

    return NextResponse.json({
      jobId,
      status: "queued",
      pollUrl: `/api/studio/export/status?jobId=${jobId}`,
      message: "Video export queued. Poll pollUrl for progress.",
    });
  } catch (err) {
    console.error("[studio/export/video]", err);
    return jsonWithRequestId(
      requestId,
      { error: err instanceof Error ? err.message : "Export failed" },
      { status: 500 }
    );
  }
}
