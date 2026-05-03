import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  clipId: z.string(),
  caption: z.string().optional(),
  platform: z.enum(["tiktok", "instagram", "youtube"]).default("tiktok"),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid social post request" }, { status: 400 });
  }

  // Placeholder: requires official API access per platform
  return NextResponse.json({
    status: "pending",
    message: "Social post queued. Requires platform API integration.",
    payload: parsed.data,
  });
}
