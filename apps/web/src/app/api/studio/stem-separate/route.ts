import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRequestId, jsonWithRequestId } from "@/lib/requestTracing";

/**
 * POST /api/studio/stem-separate
 * Separates audio into stems (vocals, drums, bass, other) using Replicate's Demucs model.
 * Accepts multipart/form-data with an "audio" file field OR JSON with { audioUrl: string }.
 * Returns: { jobId, status: "processing" } — poll GET /api/studio/stem-separate?jobId=...
 */

const REPLICATE_API = "https://api.replicate.com/v1/predictions";
// htdemucs model: 4-stem separator (vocals, drums, bass, other)
const DEMUCS_VERSION = "fc01c2e31ad377f5c7a93bd0f55cce3e";

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }

  const replicateToken = process.env.REPLICATE_API_TOKEN;
  if (!replicateToken) {
    return jsonWithRequestId(requestId, { error: "Stem separation is not configured" }, { status: 503 });
  }

  try {
    let audioUrl: string | null = null;

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      // File upload: return error — direct URL is required for Replicate
      return jsonWithRequestId(requestId, {
        error: "Please provide audioUrl in JSON body. File uploads must be pre-uploaded to storage first."
      }, { status: 400 });
    } else {
      const body = await req.json();
      audioUrl = body.audioUrl;
    }

    if (!audioUrl || typeof audioUrl !== "string") {
      return jsonWithRequestId(requestId, { error: "audioUrl is required" }, { status: 400 });
    }

    // Kick off async Demucs prediction on Replicate
    const prediction = await fetch(REPLICATE_API, {
      method: "POST",
      headers: {
        Authorization: `Token ${replicateToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: DEMUCS_VERSION,
        input: {
          audio: audioUrl,
          model: "htdemucs",
          stem: null, // separate all 4 stems
          output_format: "wav",
          mp3_bitrate: 320,
          float32: false,
        },
      }),
    });

    if (!prediction.ok) {
      const err = await prediction.text();
      console.error("[stem-separate] Replicate error", err);
      return jsonWithRequestId(requestId, { error: "Failed to start separation job" }, { status: 502 });
    }

    const job = await prediction.json();
    return jsonWithRequestId(requestId, {
      jobId: job.id,
      status: job.status,
      pollUrl: `/api/studio/stem-separate/status?jobId=${job.id}`,
    });
  } catch (err) {
    console.error("[stem-separate] error", err);
    return jsonWithRequestId(requestId, { error: "Internal server error" }, { status: 500 });
  }
}
