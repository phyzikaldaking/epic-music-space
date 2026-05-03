import { NextResponse } from "next/server";
import { z } from "zod";
import { buildClipCaption, buildHighlightTitle, scoreHighlight } from "@/lib/highlights";

const schema = z.object({
  eventType: z.enum(["leader_change", "tip", "boost", "crowd", "finale", "reaction"]),
  artist: z.string().optional(),
  songId: z.string().optional(),
  message: z.string().optional(),
  crowdEnergy: z.number().optional(),
  tipAmount: z.number().optional(),
  powerDelta: z.number().optional(),
  timestamp: z.number().optional(),
  autoPost: z.boolean().default(true),
  platforms: z.array(z.enum(["tiktok", "instagram", "youtube"])).default(["tiktok"]),
});

const VIRAL_THRESHOLD = Number(process.env.HIGHLIGHT_VIRAL_THRESHOLD ?? 75);
const CLIP_DURATION_SECONDS = Number(process.env.HIGHLIGHT_CLIP_DURATION_SECONDS ?? 15);

async function callInternalApi(path: string, body: unknown, req: Request) {
  const origin = new URL(req.url).origin;
  const response = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, data };
}

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid highlight payload" }, { status: 400 });
  }

  const input = parsed.data;
  const score = scoreHighlight(input);
  const title = buildHighlightTitle(input);
  const caption = buildClipCaption(input);
  const shouldAutoPublish = input.autoPost && score >= VIRAL_THRESHOLD && Boolean(input.songId);

  const highlight = {
    id: `hl_${Date.now()}`,
    eventType: input.eventType,
    artist: input.artist,
    songId: input.songId,
    message: input.message,
    crowdEnergy: input.crowdEnergy,
    tipAmount: input.tipAmount,
    powerDelta: input.powerDelta,
    timestamp: input.timestamp ?? Date.now(),
    score,
    title,
    caption,
    createdAt: new Date().toISOString(),
    viralThreshold: VIRAL_THRESHOLD,
    shouldAutoPublish,
  };

  const automation: {
    clip?: unknown;
    socialPosts?: unknown[];
    skippedReason?: string;
  } = {};

  if (!input.songId) {
    automation.skippedReason = "Missing songId; highlight scored but no clip could be queued.";
  } else if (score < VIRAL_THRESHOLD) {
    automation.skippedReason = `Score ${score} is below viral threshold ${VIRAL_THRESHOLD}.`;
  } else {
    const clipResponse = await callInternalApi(
      "/api/clips/export",
      {
        songId: input.songId,
        timestamp: Math.floor((input.timestamp ?? Date.now()) / 1000),
        duration: CLIP_DURATION_SECONDS,
        highlightId: highlight.id,
        title,
        caption,
        score,
      },
      req,
    );

    automation.clip = clipResponse.data;
    const clipId = clipResponse.data?.job?.id ?? clipResponse.data?.clipId ?? highlight.id;

    if (input.autoPost && clipResponse.ok && clipId) {
      automation.socialPosts = [];
      for (const platform of input.platforms) {
        const socialResponse = await callInternalApi(
          "/api/social/post",
          {
            clipId,
            caption,
            platform,
            highlightId: highlight.id,
            score,
          },
          req,
        );
        automation.socialPosts.push({ platform, ...socialResponse });
      }
    }
  }

  return NextResponse.json({
    status: "ok",
    highlight,
    automation,
  });
}
