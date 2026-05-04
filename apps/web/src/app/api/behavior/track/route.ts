import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { lenientLimiter } from "@/lib/rateLimit";

const schema = z.object({
  clipId: z.string().max(200),
  songId: z.string().max(200).optional(),
  artist: z.string().max(200).optional(),
  eventType: z.enum(["view", "watch_75", "like", "share", "skip", "view_track"]),
});

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  try {
    await lenientLimiter.consume(`behavior:${ip}`);
  } catch {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid behavior event" }, { status: 400 });
  }

  // In production: store in Supabase or analytics DB

  return NextResponse.json({ status: "tracked", event: parsed.data });
}
