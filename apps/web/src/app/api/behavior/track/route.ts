import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  clipId: z.string(),
  songId: z.string().optional(),
  artist: z.string().optional(),
  eventType: z.enum(["view", "watch_75", "like", "share", "skip", "view_track"]),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid behavior event" }, { status: 400 });
  }

  // In production: store in Supabase or analytics DB

  return NextResponse.json({ status: "tracked", event: parsed.data });
}
