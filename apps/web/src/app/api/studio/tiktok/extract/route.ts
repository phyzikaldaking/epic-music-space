import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRequestId, jsonWithRequestId } from "@/lib/requestTracing";

/**
 * Extract audio from TikTok URL
 * POST body: { tikTokUrl: string }
 * Returns: { audioUrl: string, duration: number, metadata: { title?, creator? } }
 */

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const session = await auth();

  if (!session?.user?.id) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { tikTokUrl?: string };
    const { tikTokUrl } = body;

    if (!tikTokUrl) {
      return jsonWithRequestId(
        requestId,
        { error: "tikTokUrl required" },
        { status: 400 }
      );
    }

    // Parse TikTok URL to extract video ID
    const videoId = parseTikTokUrl(tikTokUrl);
    if (!videoId) {
      return jsonWithRequestId(
        requestId,
        { error: "Invalid TikTok URL" },
        { status: 400 }
      );
    }

    // Fetch metadata and audio stream URL
    // Note: TikTok has active anti-scraping. For production, use a service like:
    // - TikTok API (developer.tiktok.com) — requires app approval
    // - Third-party service (TikTok downloader API, yt-dlp via serverless)
    // For now, return a placeholder that guides toward implementation
    const audioUrl = await fetchTikTokAudio(videoId);

    if (!audioUrl) {
      return jsonWithRequestId(
        requestId,
        {
          error:
            "Could not extract audio. TikTok requires API authentication or third-party service.",
        },
        { status: 503 }
      );
    }

    // Verify audio URL is accessible and get duration
    const audioResponse = await fetch(audioUrl, { method: "HEAD" });
    if (!audioResponse.ok) {
      return jsonWithRequestId(
        requestId,
        { error: "Audio stream not accessible" },
        { status: 500 }
      );
    }

    return jsonWithRequestId(
      requestId,
      {
        audioUrl,
        metadata: {
          videoId,
          note: "Use yt-dlp or TikTok API for production extraction",
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[studio/tiktok/extract]", err);
    return jsonWithRequestId(
      requestId,
      { error: err instanceof Error ? err.message : "Extraction failed" },
      { status: 500 }
    );
  }
}

function parseTikTokUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;

    // Format: /video/{id} or /v/{id}
    const match = pathname.match(/\/(?:video|v)\/(\d+)/);
    if (match) {
      return match[1];
    }

    // Short URL: vm.tiktok.com/{shortId}
    if (urlObj.hostname.includes("vm.tiktok.com") && pathname.length > 1) {
      return pathname.slice(1);
    }

    return null;
  } catch {
    return null;
  }
}

async function fetchTikTokAudio(videoId: string): Promise<string | null> {
  // Production implementation options:
  // 1. Use yt-dlp (Python): https://github.com/yt-dlp/yt-dlp
  //    - Spawn child process in serverless function (use Vercel KV to cache results)
  //    - Convert to MP3 for CDN caching
  //
  // 2. Use TikTok API directly:
  //    - Register developer app at https://developer.tiktok.com
  //    - Use OAuth or v_sec token flow for video data
  //    - Extract playback_url from response
  //
  // 3. Use third-party service:
  //    - TikTok downloader microservice (e.g., TikWM, SnoopGram)
  //    - Proxy through /api/studio/tiktok/extract

  // For now: return null to force caller to use one of the above
  console.log(
    `[tiktok/extract] videoId=${videoId} — implement via yt-dlp, TikTok API, or third-party service`
  );
  return null;
}
