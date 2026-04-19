import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * AI Cover Generator (stub)
 *
 * In production, this would call an AI image generation API
 * (e.g. OpenAI DALL-E, Stability AI, or Replicate) with the song
 * metadata to auto-generate album artwork.
 *
 * To enable:
 * 1. Set OPENAI_API_KEY in .env.local
 * 2. Replace the stub response with an actual API call
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { title, genre, mood, style } = await request.json();

  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  // --- STUB: Return a seeded placeholder image ---
  // Replace this block with your AI image generation call
  const seed = encodeURIComponent(`${title}-${genre}-${mood}`);
  const coverUrl = `https://picsum.photos/seed/${seed}/600/600`;

  // Simulated prompt that would be sent to AI
  const prompt = [
    `Album cover art for "${title}"`,
    genre ? `in the ${genre} genre` : "",
    mood ? `with a ${mood} mood` : "",
    style ? `in ${style} style` : "",
    "high quality, professional music artwork, vibrant colors",
  ]
    .filter(Boolean)
    .join(", ");

  return NextResponse.json({
    coverUrl,
    prompt,
    note: "AI generation stub — integrate OpenAI DALL-E or Stability AI to enable real generation",
  });
}
