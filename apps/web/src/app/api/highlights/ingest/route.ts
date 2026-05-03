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
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid highlight payload" }, { status: 400 });
  }

  const input = parsed.data;
  const score = scoreHighlight(input);
  const title = buildHighlightTitle(input);
  const caption = buildClipCaption(input);

  const highlight = {
    id: `hl_${Date.now()}`,
    ...input,
    score,
    title,
    caption,
    createdAt: new Date().toISOString(),
  };

  // In a real setup, persist to DB (Supabase) and enqueue clip job
  return NextResponse.json({
    status: "ok",
    highlight,
    next: {
      exportClip: "/api/clips/export",
      postSocial: "/api/social/post",
    },
  });
}
