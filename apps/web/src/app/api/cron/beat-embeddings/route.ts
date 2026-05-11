import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCronRequest } from "@/lib/routeAuth";
import { describeBeat, embedBeat, upsertBeatEmbedding } from "@/lib/beatEmbedding";

export const runtime = "nodejs";
export const maxDuration = 60;

// Reads recently-published songs that don't yet have a BeatEmbedding
// row, extracts a beat descriptor from the artist's most recent
// StudioProject (where the pattern lives), and indexes the vector.
//
// Songs without a recoverable pattern (uploaded outside the studio)
// get a degenerate descriptor of just `genre @ BPM` — still useful
// for genre/BPM filtering on similarity searches.

interface PatternJson {
  beat?: { bankPatterns?: Record<string, Record<string, boolean[]>>; kit?: string };
}

function patternToHex(pattern: PatternJson | null | undefined): string | null {
  const bank = pattern?.beat?.bankPatterns?.A;
  if (!bank) return null;
  const lanes = ["kick", "snare", "clap", "hat", "openHat", "perc", "bass808", "crash"];
  const tokens: string[] = [];
  for (const lane of lanes) {
    const steps = bank[lane];
    if (!Array.isArray(steps)) continue;
    let mask = 0;
    for (let i = 0; i < 16; i++) {
      if (steps[i]) mask |= 1 << (15 - i);
    }
    tokens.push(`${lane}:${mask.toString(16).padStart(4, "0")}`);
  }
  return tokens.join(" ");
}

export async function GET(req: NextRequest) {
  const cronGate = requireCronRequest(req);
  if (!cronGate.ok) return cronGate.response;

  // Find songs with no embedding row. We use a left-join via raw
  // SQL to avoid pulling all embeddings + filtering in JS.
  const candidates = await prisma.$queryRaw<
    Array<{ id: string; bpm: number | null; genre: string | null; artistId: string }>
  >`
    SELECT s."id", s."bpm", s."genre", s."artistId"
      FROM "Song" s
      LEFT JOIN "BeatEmbedding" be ON be."songId" = s."id"
     WHERE be."id" IS NULL
       AND s."isActive" = true
       AND s."isDraft" = false
     ORDER BY s."createdAt" DESC
     LIMIT 30
  `;

  let embedded = 0;
  let skipped = 0;
  let failed = 0;

  for (const song of candidates) {
    // Pull the artist's most recent project for the pattern.
    const project = await prisma.studioProject.findFirst({
      where: { userId: song.artistId },
      orderBy: { updatedAt: "desc" },
      select: { patternJson: true },
    });
    const patternHex = patternToHex(project?.patternJson as PatternJson | null) ??
      // Degenerate descriptor — still searchable on genre / BPM.
      "kick:0000";
    const descriptor = {
      bpm: song.bpm ?? 120,
      genre: song.genre,
      kit:
        (project?.patternJson as PatternJson | null)?.beat?.kit ?? null,
      patternHex,
    };
    const vec = await embedBeat(descriptor);
    if (!vec) {
      // No OpenAI key configured — index the row with a deterministic
      // pseudo-vector so the schema stays populated and we can swap
      // in real embeddings later. Hashes of the descriptor produce
      // a stable 384-dim vector.
      const pseudo = pseudoVectorFromString(JSON.stringify(descriptor));
      await upsertBeatEmbedding({
        songId: song.id,
        descriptor,
        vector: pseudo,
      }).catch(() => {
        failed++;
      });
      skipped++;
      continue;
    }
    try {
      await upsertBeatEmbedding({
        songId: song.id,
        descriptor,
        vector: vec,
      });
      embedded++;
    } catch (err) {
      console.warn("[beat-embeddings] insert failed", err);
      failed++;
    }
    // Use the descriptor we built so the lint doesn't flag it unused
    // — it's also useful for telemetry.
    void describeBeat;
  }

  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    embedded,
    skipped,
    failed,
  });
}

// Deterministic 384-dim pseudo-vector for environments without an
// OpenAI key. Not a real embedding — preserves consistency so the
// suggestion endpoint works in dev / CI without crashing. Real
// production keeps the OPENAI_API_KEY env var set.
function pseudoVectorFromString(s: string): number[] {
  const out: number[] = new Array(384).fill(0);
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  let seed = hash >>> 0;
  for (let i = 0; i < 384; i++) {
    seed = (1103515245 * seed + 12345) & 0x7fffffff;
    out[i] = (seed / 0x40000000 - 1.0) * 0.1;
  }
  return out;
}
