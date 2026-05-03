import { NextResponse } from "next/server";
import { generateAutoClips } from "@/lib/autoClipper";

const AUTO_RENDER_THRESHOLD = Number(process.env.AUTO_RENDER_CLIP_THRESHOLD ?? 75);
const AUTO_POST_THRESHOLD = Number(process.env.AUTO_POST_CLIP_THRESHOLD ?? 85);
const DEFAULT_PLATFORMS = (process.env.AUTO_POST_PLATFORMS ?? "tiktok,instagram,youtube")
  .split(",")
  .map((platform) => platform.trim())
  .filter(Boolean);

async function callInternalApi(path: string, body: unknown, req: Request) {
  const origin = new URL(req.url).origin;
  const response = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return {
    ok: response.ok,
    status: response.status,
    data: await response.json().catch(() => null),
  };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.songId) {
    return NextResponse.json({ error: "Missing song data" }, { status: 400 });
  }

  const autoRender = body.autoRender ?? true;
  const autoPost = body.autoPost ?? true;
  const platforms = Array.isArray(body.platforms) && body.platforms.length > 0 ? body.platforms : DEFAULT_PLATFORMS;
  const clips = generateAutoClips(body);

  const pipeline = [];

  for (const clip of clips) {
    const shouldRender = autoRender && clip.viralScore >= AUTO_RENDER_THRESHOLD;
    const shouldPost = autoPost && clip.viralScore >= AUTO_POST_THRESHOLD;

    const item: {
      clip: typeof clip;
      render?: unknown;
      highlight?: unknown;
      socialPosts?: unknown[];
      skippedReason?: string;
    } = { clip };

    if (!shouldRender) {
      item.skippedReason = `Score ${clip.viralScore} is below render threshold ${AUTO_RENDER_THRESHOLD}.`;
      pipeline.push(item);
      continue;
    }

    const renderResponse = await callInternalApi(
      "/api/clips/export",
      {
        songId: clip.songId,
        timestamp: clip.startTime,
        duration: clip.durationSeconds,
        highlightId: clip.id,
        title: clip.title,
        caption: clip.caption,
        score: clip.viralScore,
        momentType: clip.momentType,
      },
      req,
    );

    item.render = renderResponse.data;
    const renderedClipId = renderResponse.data?.job?.id ?? renderResponse.data?.clipId ?? clip.id;

    const highlightResponse = await callInternalApi(
      "/api/highlights/ingest",
      {
        eventType:
          clip.momentType === "beat_drop"
            ? "boost"
            : clip.momentType === "crown"
              ? "leader_change"
              : clip.momentType === "tip"
                ? "tip"
                : clip.momentType === "crowd"
                  ? "crowd"
                  : "reaction",
        artist: body.artist,
        songId: clip.songId,
        message: clip.title,
        crowdEnergy: Math.min(100, clip.viralScore),
        powerDelta: clip.viralScore,
        timestamp: clip.startTime * 1000,
        autoPost: false,
      },
      req,
    );

    item.highlight = highlightResponse.data;

    if (shouldPost && renderResponse.ok && renderedClipId) {
      item.socialPosts = [];
      for (const platform of platforms) {
        const socialResponse = await callInternalApi(
          "/api/social/post",
          {
            clipId: renderedClipId,
            caption: clip.caption,
            platform,
            highlightId: clip.id,
            score: clip.viralScore,
          },
          req,
        );
        item.socialPosts.push({ platform, ...socialResponse });
      }
    }

    pipeline.push(item);
  }

  return NextResponse.json({
    status: "ok",
    automation: {
      autoRender,
      autoPost,
      renderThreshold: AUTO_RENDER_THRESHOLD,
      postThreshold: AUTO_POST_THRESHOLD,
      platforms,
    },
    clips,
    pipeline,
  });
}
