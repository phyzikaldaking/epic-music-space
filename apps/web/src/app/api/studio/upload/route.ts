import { NextRequest } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/lib/auth";
import { strictLimiter } from "@/lib/rateLimit";
import { getRequestId, jsonWithRequestId } from "@/lib/requestTracing";

// Client-direct upload to Vercel Blob using @vercel/blob/client. The
// client posts here twice: once for `blob.generate-client-token` to mint
// a short-lived token for direct upload, then again for
// `blob.upload-completed` so we can do bookkeeping. Keeps audio off our
// API server entirely — it goes browser → Vercel Blob.
export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }

  try {
    await strictLimiter.consume(`studio:upload:${session.user.id}`);
  } catch {
    return jsonWithRequestId(
      requestId,
      { error: "Too many uploads — slow down." },
      { status: 429, headers: { "Retry-After": "30" } },
    );
  }

  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        // Audio only. Vercel Blob enforces these on the upload call.
        allowedContentTypes: [
          "audio/wav",
          "audio/x-wav",
          "audio/mpeg",
          "audio/mp4",
          "audio/aac",
          "audio/ogg",
          "audio/webm",
          "audio/flac",
          "audio/aiff",
          "audio/x-aiff",
        ],
        // Up to 60 MB per track — enough for a long stem at 24-bit/48k.
        maximumSizeInBytes: 60 * 1024 * 1024,
        // Stamp the user id onto the blob path so we can audit later.
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ userId: session.user!.id! }),
      }),
      onUploadCompleted: async () => {
        // No-op for v1. Future: persist a StudioBlob row + GC sweep.
      },
    });
    return Response.json(result);
  } catch (err) {
    console.error("[studio/upload] failed", { requestId, err });
    return jsonWithRequestId(
      requestId,
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 400 },
    );
  }
}
