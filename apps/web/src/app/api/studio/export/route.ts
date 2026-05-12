import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRequestId, jsonWithRequestId } from "@/lib/requestTracing";

/**
 * Create an export job for a project
 * POST body: { projectId: string, format: "mp4" | "webm", resolution: "720p" | "1080p" }
 * Returns: export job with status tracking
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
      format?: string;
      resolution?: string;
    };

    const { projectId, format = "mp4", resolution = "1080p" } = body;

    if (!projectId) {
      return jsonWithRequestId(
        requestId,
        { error: "projectId required" },
        { status: 400 }
      );
    }

    // Validate format and resolution
    if (!["mp4", "webm"].includes(format)) {
      return jsonWithRequestId(
        requestId,
        { error: "Invalid format. Use mp4 or webm" },
        { status: 400 }
      );
    }

    if (!["720p", "1080p"].includes(resolution)) {
      return jsonWithRequestId(
        requestId,
        { error: "Invalid resolution. Use 720p or 1080p" },
        { status: 400 }
      );
    }

    // Verify project ownership
    const project = await prisma.studioProject.findUnique({
      where: { id: projectId },
    });

    if (!project || project.userId !== session.user.id) {
      return jsonWithRequestId(
        requestId,
        { error: "Project not found or access denied" },
        { status: 404 }
      );
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const job = await prisma.exportJob.create({
      data: {
        userId: session.user.id,
        projectId,
        format,
        resolution,
        status: "pending",
        progressPercent: 0,
        expiresAt,
      },
    });

    // TODO: Queue async video export job via Vercel Cron or external service
    // - Trigger video rendering pipeline (use ffmpeg or Modal Labs)
    // - Poll status via GET /api/studio/export?jobId={id}
    // - On completion, upload result to Vercel Blob and update outputUrl
    // handleVideoExport(job.id, projectId, format, resolution);

    return jsonWithRequestId(
      requestId,
      {
        id: job.id,
        projectId: job.projectId,
        status: job.status,
        format: job.format,
        resolution: job.resolution,
        progressPercent: job.progressPercent,
        createdAt: job.createdAt,
        expiresAt: job.expiresAt,
      },
      { status: 202 }
    );
  } catch (err) {
    console.error("[studio/export]", err);
    return jsonWithRequestId(
      requestId,
      { error: err instanceof Error ? err.message : "Failed to create export job" },
      { status: 500 }
    );
  }
}

/**
 * Get export job status
 * GET /api/studio/export?jobId=...
 */
export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  const session = await auth();

  if (!session?.user?.id) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }

  try {
    const jobId = req.nextUrl.searchParams.get("jobId");

    if (!jobId) {
      return jsonWithRequestId(
        requestId,
        { error: "jobId required" },
        { status: 400 }
      );
    }

    const job = await prisma.exportJob.findUnique({
      where: { id: jobId },
    });

    if (!job || job.userId !== session.user.id) {
      return jsonWithRequestId(
        requestId,
        { error: "Job not found" },
        { status: 404 }
      );
    }

    return jsonWithRequestId(
      requestId,
      {
        id: job.id,
        status: job.status,
        progressPercent: job.progressPercent,
        outputUrl: job.outputUrl,
        errorMessage: job.errorMessage,
        createdAt: job.createdAt,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[studio/export]", err);
    return jsonWithRequestId(
      requestId,
      { error: err instanceof Error ? err.message : "Failed to fetch job status" },
      { status: 500 }
    );
  }
}
