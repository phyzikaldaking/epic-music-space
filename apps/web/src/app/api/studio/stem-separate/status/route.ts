import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRequestId, jsonWithRequestId } from "@/lib/requestTracing";

/**
 * GET /api/studio/stem-separate/status?jobId=...
 * Polls Replicate for stem separation job status.
 * Returns: { status, stems: { vocals, drums, bass, other } } when complete.
 */
export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }

  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return jsonWithRequestId(requestId, { error: "jobId is required" }, { status: 400 });
  }

  const replicateToken = process.env.REPLICATE_API_TOKEN;
  if (!replicateToken) {
    return jsonWithRequestId(requestId, { error: "Stem separation is not configured" }, { status: 503 });
  }

  try {
    const resp = await fetch(`https://api.replicate.com/v1/predictions/${jobId}`, {
      headers: { Authorization: `Token ${replicateToken}` },
    });
    if (!resp.ok) {
      return jsonWithRequestId(requestId, { error: "Failed to fetch job status" }, { status: 502 });
    }

    const job = await resp.json();

    if (job.status === "succeeded" && job.output) {
      // Demucs output is an array: [vocals.wav, drums.wav, bass.wav, other.wav]
      const [vocals, drums, bass, other] = Array.isArray(job.output) ? job.output : [];
      return jsonWithRequestId(requestId, {
        status: "succeeded",
        stems: { vocals: vocals ?? null, drums: drums ?? null, bass: bass ?? null, other: other ?? null },
      });
    }

    if (job.status === "failed") {
      return jsonWithRequestId(requestId, { status: "failed", error: job.error ?? "Separation failed" }, { status: 422 });
    }

    return jsonWithRequestId(requestId, {
      status: job.status, // "starting" | "processing"
      progress: job.logs ?? null,
    });
  } catch (err) {
    console.error("[stem-separate/status] error", err);
    return jsonWithRequestId(requestId, { error: "Internal server error" }, { status: 500 });
  }
}
