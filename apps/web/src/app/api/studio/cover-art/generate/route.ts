import { NextResponse } from "next/server";

export const runtime = "nodejs";

type CoverArtRequest = {
  title?: string;
  artist?: string;
  genre?: string;
  mood?: string;
  description?: string;
};

function hasOpenAiKey(): boolean {
  const key = process.env.OPENAI_API_KEY;
  return Boolean(key && key.startsWith("sk-") && !key.includes("replace"));
}

function buildPrompt(input: CoverArtRequest): string {
  const title = input.title?.trim() || "Untitled Record";
  const artist = input.artist?.trim() || "Epic Music Space artist";
  const genre = input.genre?.trim() || "modern hip-hop";
  const mood = input.mood?.trim() || "cinematic, premium, emotional";
  const description = input.description?.trim() || "Create a high-end album cover that feels expensive, memorable, and streaming-ready.";

  return [
    "Create square album cover artwork for a music release.",
    `Song title: ${title}.`,
    `Artist: ${artist}.`,
    `Genre: ${genre}.`,
    `Mood: ${mood}.`,
    description,
    "Style: professional music cover, cinematic lighting, premium editorial design, no explicit logos, no readable text unless requested, suitable for Spotify/Apple Music artwork.",
  ].join(" ");
}

export async function POST(req: Request) {
  let body: CoverArtRequest;
  try {
    body = (await req.json()) as CoverArtRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const prompt = buildPrompt(body);

  if (!hasOpenAiKey()) {
    return NextResponse.json(
      {
        ok: false,
        unavailable: true,
        error: "AI cover art generation needs OPENAI_API_KEY in Vercel environment variables.",
        prompt,
        fallback: {
          title: body.title?.trim() || "Untitled Record",
          guidance: "Use this prompt in the AI art tool once the OpenAI key is configured.",
        },
      },
      { status: 503 },
    );
  }

  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const image = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
      quality: "high",
      n: 1,
    });

    const first = image.data?.[0];
    const b64 = first?.b64_json;
    const url = first?.url;

    if (!b64 && !url) {
      return NextResponse.json({ ok: false, error: "Image generation returned no image.", prompt }, { status: 502 });
    }

    return NextResponse.json({ ok: true, prompt, imageBase64: b64 ?? null, imageUrl: url ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown image generation error.";
    return NextResponse.json({ ok: false, error: message, prompt }, { status: 500 });
  }
}
