import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimitInline";
import { embedBeat, searchSimilarBeats } from "@/lib/beatEmbedding";

export const runtime = "nodejs";

// Beat-AI suggestion endpoint. The studio calls this with the user's
// current pattern + BPM + genre + kit; we embed the query, find the
// K most similar published beats, and return their patterns so the
// studio can show "producers in your genre also hit kick on step 11".

const schema = z.object({
  bpm: z.number().min(40).max(220),
  genre: z.string().max(40).optional(),
  kit: z.string().max(40).optional(),
  patternHex: z.string().max(200),
  k: z.number().int().min(1).max(20).optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  // Suggestions are useful even for anonymous browsers — rate-limit
  // by IP rather than requiring auth.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const blocked = await rateLimit("moderate", `beat-ai:${session?.user?.id ?? ip}`);
  if (blocked) return blocked;

  const body = (await req.json().catch(() => ({}))) as unknown;
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const descriptor = {
    bpm: parsed.data.bpm,
    genre: parsed.data.genre ?? null,
    kit: parsed.data.kit ?? null,
    patternHex: parsed.data.patternHex,
  };
  const vec = await embedBeat(descriptor);
  if (!vec) {
    return NextResponse.json({
      suggestions: [],
      note: "Embedding model not configured — suggestions unavailable.",
    });
  }

  // BPM filter ±15% so suggestions feel in-tempo. Genre exact match
  // when the caller passed one.
  const bpmFloor = Math.round(descriptor.bpm * 0.85);
  const bpmCeil = Math.round(descriptor.bpm * 1.15);
  const matches = await searchSimilarBeats({
    vector: vec,
    k: parsed.data.k ?? 6,
    filter: {
      bpm: { min: bpmFloor, max: bpmCeil },
      ...(descriptor.genre ? { genre: descriptor.genre } : {}),
    },
  });

  // Build a human-readable suggestion narrative for each hit. The
  // studio surfaces these inline ("87% of trap beats at 142 BPM
  // also have a kick on step 11").
  const suggestions = matches.map((m) => {
    return {
      songId: m.songId,
      bpm: m.bpm,
      genre: m.genre,
      kit: m.kit,
      patternHex: m.patternHex,
      similarity: Math.max(0, 1 - m.distance / 2), // cosine dist 0..2 → similarity 1..0
    };
  });

  return NextResponse.json({ suggestions });
}
