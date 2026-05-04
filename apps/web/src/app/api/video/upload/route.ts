import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getMuxClient } from "@/lib/mux";
import { moderateLimiter } from "@/lib/rateLimit";

/**
 * POST /api/video/upload
 *
 * Creates a Mux Direct Upload and returns a one-time URL the browser can
 * PUT a video file to. Mux ingests, encodes, and pings our webhook
 * (/api/webhooks/mux) when the asset is ready — at which point we set
 * playbackId on the post.
 *
 * Returns: { uploadUrl, uploadId }
 */
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await moderateLimiter.consume(`video-upload:${ip}`);
  } catch {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mux = getMuxClient();
  if (!mux) {
    return NextResponse.json(
      {
        error:
          "Video uploads aren't configured on this environment. Photo posts work — try attaching an image instead.",
      },
      { status: 503 }
    );
  }

  const origin = req.headers.get("origin") ?? "*";

  try {
    const upload = await mux.video.uploads.create({
      cors_origin: origin,
      // Bind this upload to the caller — checked at post-create time so
      // someone can't claim another user's upload as their own.
      // Mux echoes passthrough on the asset and on webhook payloads.
      new_asset_settings: {
        playback_policy: ["public"],
        passthrough: session.user.id,
        // `video_quality: "plus"` is the modern equivalent of the deprecated
        // `encoding_tier: "smart"` — better adaptive bitrate, same price.
        video_quality: "plus",
      },
    });

    return NextResponse.json({
      uploadUrl: upload.url,
      uploadId: upload.id,
    });
  } catch (err) {
    console.error("[video:upload] mux create failed", err);
    return NextResponse.json(
      { error: "Could not start video upload. Please try again." },
      { status: 500 }
    );
  }
}
