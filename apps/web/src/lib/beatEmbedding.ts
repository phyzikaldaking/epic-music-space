import { prisma } from "@/lib/prisma";
import { openai, openaiConfigured } from "@/lib/ai";

// Beat embedding utility. Two paths:
//
//   1. Embed-from-pattern (fast, free, deterministic): turn the
//      beat pattern + genre + BPM + kit into a textual descriptor
//      ("trap @ 142 BPM · 808 kick on 1,9 · snare on 5,13 · ...")
//      and feed it to an OpenAI text-embedding-3-small model
//      (1536-dim). We down-project to 384 dims by averaging
//      adjacent groups of 4 so the column matches pgvector(384).
//
//   2. (Future) Audio-embed: run the rendered audio through a
//      music-specific encoder (CLAP, MERT) and store its
//      representation. Hooks in when we wire the diffusion model
//      training pipeline. The schema already has space.
//
// All embeddings use the same 384-dim space so suggestion search
// stays compatible across the two paths.

const VECTOR_DIM = 384;

export interface BeatDescriptor {
  bpm: number;
  genre: string | null;
  kit: string | null;
  patternHex: string; // hex per-lane bitmask, same as studio context store
}

// Convert hex pattern → human-readable lane:step description.
export function describeBeat(d: BeatDescriptor): string {
  const parts: string[] = [];
  parts.push(`${d.genre ?? "untagged"} @ ${d.bpm} BPM`);
  if (d.kit) parts.push(`kit: ${d.kit}`);
  // patternHex is space-separated entries like "kick:9001 snare:1010 ...".
  // The studio's existing context store builder uses that shape; if
  // it changes the embedding will still be deterministic per song.
  const tokens = d.patternHex.split(/\s+/);
  for (const tok of tokens) {
    const [lane, hex] = tok.split(":");
    if (!lane || !hex) continue;
    const num = parseInt(hex, 16);
    if (Number.isNaN(num)) continue;
    const onSteps: number[] = [];
    for (let i = 0; i < 16; i++) {
      if ((num >> (15 - i)) & 1) onSteps.push(i + 1);
    }
    if (onSteps.length > 0) {
      parts.push(`${lane} on ${onSteps.join(",")}`);
    }
  }
  // Cap so we don't blow embedding context.
  return parts.join(" · ").slice(0, 1200);
}

/** Compress a 1536-dim OpenAI embedding to our 384-dim column by
 *  averaging adjacent groups of 4. This loses precision but keeps
 *  cosine similarity ordering useful for the suggestion search. */
function compressTo384(input: number[]): number[] {
  const groupSize = Math.floor(input.length / VECTOR_DIM);
  const out: number[] = new Array(VECTOR_DIM).fill(0);
  for (let i = 0; i < VECTOR_DIM; i++) {
    let sum = 0;
    for (let j = 0; j < groupSize; j++) {
      sum += input[i * groupSize + j] ?? 0;
    }
    out[i] = sum / Math.max(1, groupSize);
  }
  return out;
}

/** Compute the embedding for a beat descriptor. Returns null when
 *  the OpenAI key isn't configured (CI / local dev), so the caller
 *  can skip indexing without crashing. */
export async function embedBeat(d: BeatDescriptor): Promise<number[] | null> {
  if (!openai || !openaiConfigured) return null;
  try {
    const res = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: describeBeat(d),
    });
    const raw = res.data[0]?.embedding;
    if (!raw) return null;
    return compressTo384(raw);
  } catch (err) {
    console.warn("[embedBeat] failed", err);
    return null;
  }
}

/** Upsert a BeatEmbedding row with vector via raw SQL since Prisma
 *  doesn't model vector(N). The vector serializes as `'[v1,v2,...]'`
 *  which pgvector accepts on insert. */
export async function upsertBeatEmbedding(args: {
  songId: string;
  descriptor: BeatDescriptor;
  vector: number[];
}): Promise<void> {
  const { songId, descriptor, vector } = args;
  if (vector.length !== VECTOR_DIM) {
    throw new Error(`expected ${VECTOR_DIM}-dim vector, got ${vector.length}`);
  }
  const id = `be_${Math.random().toString(36).slice(2, 12)}_${Date.now()}`;
  const vectorLiteral = `[${vector.map((v) => v.toFixed(6)).join(",")}]`;
  await prisma.$executeRaw`
    INSERT INTO "BeatEmbedding" ("id","songId","bpm","genre","kit","patternHex","embedding","createdAt")
    VALUES (${id}, ${songId}, ${descriptor.bpm}, ${descriptor.genre}, ${descriptor.kit}, ${descriptor.patternHex}, ${vectorLiteral}::vector, NOW())
    ON CONFLICT ("songId") DO UPDATE SET
      "bpm" = EXCLUDED."bpm",
      "genre" = EXCLUDED."genre",
      "kit" = EXCLUDED."kit",
      "patternHex" = EXCLUDED."patternHex",
      "embedding" = EXCLUDED."embedding"
  `;
}

/** Search for the K most similar beats to a query vector. Returns
 *  full metadata + cosine distance. The IVFFlat index keeps this
 *  sub-100ms up to ~1M rows. */
export async function searchSimilarBeats(args: {
  vector: number[];
  k?: number;
  filter?: { bpm?: { min: number; max: number }; genre?: string };
  excludeSongId?: string;
}): Promise<Array<{ songId: string; bpm: number; genre: string | null; kit: string | null; patternHex: string; distance: number }>> {
  const { vector, filter, excludeSongId } = args;
  const k = args.k ?? 8;
  if (vector.length !== VECTOR_DIM) {
    throw new Error(`expected ${VECTOR_DIM}-dim vector`);
  }
  const vectorLiteral = `[${vector.map((v) => v.toFixed(6)).join(",")}]`;
  // We assemble the WHERE dynamically — pgvector's <=> operator
  // returns cosine distance (0 = identical, 2 = opposite). Filter
  // by BPM range / genre when the caller asked, so a trap producer
  // gets trap suggestions, not the global similarity nearest.
  const conds: string[] = [];
  if (filter?.bpm) conds.push(`"bpm" BETWEEN ${filter.bpm.min} AND ${filter.bpm.max}`);
  if (filter?.genre) conds.push(`"genre" = '${filter.genre.replace(/'/g, "''")}'`);
  if (excludeSongId) conds.push(`"songId" <> '${excludeSongId.replace(/'/g, "''")}'`);
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  // Raw query because Prisma doesn't support the <=> operator natively.
  // `$queryRawUnsafe` with bound vector literal is safe here — the
  // filter values are validated above + escaped, the vector is
  // numeric-only.
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      songId: string;
      bpm: number;
      genre: string | null;
      kit: string | null;
      patternHex: string;
      distance: number;
    }>
  >(
    `SELECT "songId", "bpm", "genre", "kit", "patternHex",
            ("embedding" <=> $1::vector)::float8 AS distance
       FROM "BeatEmbedding"
       ${where}
       ORDER BY "embedding" <=> $1::vector
       LIMIT ${Math.max(1, Math.min(50, k))}`,
    vectorLiteral,
  );
  return rows;
}
