import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { openai } from "@/lib/ai";
import { strictLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  title: z.string().min(1).max(120),
  genre: z.string().max(60).optional(),
  mood: z.string().max(60).optional(),
});

/**
 * POST /api/cover/generate
 *
 * Generates a 1024×1024 cover image via OpenAI from track metadata. Returns
 * a base64 PNG that the upload form turns into a File and uploads through
 * the normal /api/upload pipeline.
 *
 * Rate-limited per-user; image generation is expensive ($0.04 per call).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!openai) {
    return NextResponse.json(
      { error: "Cover generation is not configured." },
      { status: 503 },
    );
  }
  try {
    await strictLimiter.consume(`cover-gen:${session.user.id}`);
  } catch {
    return NextResponse.json(
      { error: "You're generating covers too quickly. Try again in a minute." },
      { status: 429 },
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { title, genre, mood } = parsed.data;
  const prompt = [
    `Album cover art for a song titled "${title}".`,
    genre ? `Genre: ${genre}.` : "",
    mood ? `Mood: ${mood}.` : "",
    "Square 1:1 composition. No text, no typography, no watermarks. Cinematic, high contrast, gallery-quality.",
  ]
    .filter(Boolean)
    .join(" ");

  try {
    const result = await openai.images.generate({
      model: "dall-e-3",
      prompt,
      size: "1024x1024",
      n: 1,
      response_format: "b64_json",
      quality: "standard",
      style: "vivid",
    });
    const b64 = result.data?.[0]?.b64_json;
    if (!b64) {
      return NextResponse.json({ error: "No image returned" }, { status: 502 });
    }
    return NextResponse.json({ imageBase64: b64, prompt });
  } catch (err) {
    console.error("[cover-generate] failed", err);
    return NextResponse.json(
      { error: "Cover generation failed. Please try again." },
      { status: 502 },
    );
  }
}
