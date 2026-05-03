import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  text: z.string().min(1).max(500),
  voice: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid announcer request" }, { status: 400 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = parsed.data.voice || process.env.ELEVENLABS_VOICE_ID;

  if (!apiKey || !voiceId) {
    return NextResponse.json({
      mode: "browser_fallback",
      text: parsed.data.text,
      message: "ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID are required for real AI voice.",
    });
  }

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: parsed.data.text,
      model_id: process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.38,
        similarity_boost: 0.78,
        style: 0.62,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    return NextResponse.json({ error: "AI voice provider failed" }, { status: 502 });
  }

  const audio = await response.arrayBuffer();
  return new Response(audio, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
