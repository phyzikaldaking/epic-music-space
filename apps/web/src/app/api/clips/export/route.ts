import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  songId: z.string(),
  timestamp: z.number(),
  duration: z.number().default(15),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid clip request" }, { status: 400 });
  }

  // Placeholder: real implementation would queue ffmpeg / cloud render job
  return NextResponse.json({
    status: "queued",
    message: "Clip export queued",
    job: {
      ...parsed.data,
      id: `clip_${Date.now()}`,
    },
  });
}
