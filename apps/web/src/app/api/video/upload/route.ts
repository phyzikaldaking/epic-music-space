import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getClientIp } from "@/lib/authIdentity";
import { getMuxClient } from "@/lib/mux";
import { moderateLimiter } from "@/lib/rateLimit";
import { getSiteUrl } from "@/lib/site";

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
  const reqOrigin = req.headers.get("origin");
  const ip = getClientIp(req.headers);

  let canonical = "";
  try {
    canonical = new URL(getSiteUrl()).origin;
  } catch {
    canonical = req.nextUrl.origin;
  }
  const allowedOrigins = new Set<string>([req.nextUrl.origin, canonical].filter(Boolean));
  if (canonical) {
    try {
      const u = new URL(canonical);
      const host = u.host;
      const flipped = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
      allowedOrigins.add(`${u.protocol}//${flipped}`);
    } catch {
      /* ignore */
    }
  }
  if (
    reqOrigin &&
    /^https:\/\/epic-music-space-[a-z0-9-]+\.vercel\.app$/.test(reqOrigin)
  ) {
    allowedOrigins.add(reqOrigin);
  }
  if (reqOrigin && !allowedOrigins.has(reqOrigin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  // ── Resolve CORS origin from the same server-side allowlist used for
  // same-origin request enforcement above.
  const corsOrigin =
    reqOrigin && allowedOrigins.has(reqOrigin)
      ? reqOrigin
      : canonical || "https://epicmusicspace.com";

  try {
    const upload = await mux.video.uploads.create({
      cors_origin: corsOrigin,
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
