import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRequestId, jsonWithRequestId } from "@/lib/requestTracing";
import { createExportJob } from "@/lib/studioProductionSystems";

const LEGACY_VIDEO_FORMATS = ["mp4", "webm"];
const AUDIO_EXPORT_FORMATS = ["full_mix", "stems", "preview", "license_package"] as const;

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const session = await auth();

  if (!session?.user?.id) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { projectId?: string; sessionId?: string; format?: string; resolution?: string };
    const { projectId, sessionId = "ems-main-session", format = "full_mix", resolution = "1080p" } = body;

    if (!projectId) return jsonWithRequestId(requestId, { error: "projectId required" }, { status: 400 });

    const project = await prisma.studioProject.findUnique({ where: { id: projectId } });
    if (!project || project.userId !== session.user.id) {
      return jsonWithRequestId(requestId, { error: "Project not found or access denied" }, { status: 404 });
    }

    if ((AUDIO_EXPORT_FORMATS as readonly string[]).includes(format)) {
      const queued = createExportJob(projectId, sessionId, format as (typeof AUDIO_EXPORT_FORMATS)[number]);
      return jsonWithRequestId(requestId, { ...queued, message: "Audio export job queued for offline render worker handoff." }, { status: 202 });
    }

    if (!LEGACY_VIDEO_FORMATS.includes(format)) return jsonWithRequestId(requestId, { error: "Invalid format. Use full_mix, stems, preview, license_package, mp4, or webm" }, { status: 400 });
    if (!["720p", "1080p"].includes(resolution)) return jsonWithRequestId(requestId, { error: "Invalid resolution. Use 720p or 1080p" }, { status: 400 });

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const job = await prisma.exportJob.create({ data: { userId: session.user.id, projectId, format, resolution, status: "pending", progressPercent: 0, expiresAt } });

    return jsonWithRequestId(requestId, { id: job.id, projectId: job.projectId, status: job.status, format: job.format, resolution: job.resolution, progressPercent: job.progressPercent, createdAt: job.createdAt, expiresAt: job.expiresAt }, { status: 202 });
  } catch (err) {
    console.error("[studio/export]", err);
    return jsonWithRequestId(requestId, { error: err instanceof Error ? err.message : "Failed to create export job" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  const session = await auth();

  if (!session?.user?.id) return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });

  try {
    const jobId = req.nextUrl.searchParams.get("jobId");
    if (!jobId) return jsonWithRequestId(requestId, { error: "jobId required" }, { status: 400 });

    const job = await prisma.exportJob.findUnique({ where: { id: jobId } });
    if (!job || job.userId !== session.user.id) return jsonWithRequestId(requestId, { error: "Job not found" }, { status: 404 });

    return jsonWithRequestId(requestId, { id: job.id, status: job.status, progressPercent: job.progressPercent, outputUrl: job.outputUrl, errorMessage: job.errorMessage, createdAt: job.createdAt }, { status: 200 });
  } catch (err) {
    console.error("[studio/export]", err);
    return jsonWithRequestId(requestId, { error: err instanceof Error ? err.message : "Failed to fetch job status" }, { status: 500 });
  }
}
