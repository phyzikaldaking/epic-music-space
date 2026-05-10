// Lightweight mood-tag heuristic for SongCards.
//
// We don't have a dedicated `mood` column on Song yet — adding one would
// be a Prisma migration plus a backfill story. In the meantime, a small
// BPM + genre rule yields a usable descriptor for sync buyers scanning
// the public studio: they want to know "vibe at a glance" before they
// click. The mapping is intentionally simple and biased toward
// recognizable English moods rather than music-theory precision.
//
// If/when the AI scoring pipeline produces real mood tags, swap this
// out with a column read — the call sites only depend on the string.

const GENRE_HINTS: Record<string, string> = {
  "lo-fi": "Chill",
  lofi: "Chill",
  ambient: "Atmospheric",
  classical: "Cinematic",
  jazz: "Smooth",
  rnb: "Soulful",
  "r&b": "Soulful",
  soul: "Soulful",
  country: "Heartfelt",
  folk: "Heartfelt",
  acoustic: "Heartfelt",
  pop: "Bright",
  edm: "Energetic",
  house: "Energetic",
  techno: "Driving",
  drum: "Driving",
  "drum and bass": "Driving",
  dnb: "Driving",
  trap: "Hard",
  drill: "Hard",
  metal: "Aggressive",
  punk: "Aggressive",
  rock: "Anthemic",
  indie: "Reflective",
  hip: "Confident",
  "hip-hop": "Confident",
  "hip hop": "Confident",
  rap: "Confident",
};

/** Return a short mood descriptor, or null when we can't infer one
 *  confidently. Output is meant for a chip next to BPM/Key/Genre. */
export function moodFor(args: {
  bpm?: number | null;
  genre?: string | null;
}): string | null {
  const genreLower = args.genre?.toLowerCase().trim() ?? "";
  // Genre wins when we have a known hint — it's a stronger signal than
  // tempo alone (a 140 BPM lo-fi is still chill).
  if (genreLower) {
    for (const [key, mood] of Object.entries(GENRE_HINTS)) {
      if (genreLower.includes(key)) return mood;
    }
  }
  // Fall back to tempo bands when genre is missing or unknown.
  const bpm = args.bpm ?? 0;
  if (bpm <= 0) return null;
  if (bpm < 70) return "Slow";
  if (bpm < 95) return "Chill";
  if (bpm < 115) return "Groovy";
  if (bpm < 135) return "Upbeat";
  if (bpm < 160) return "Energetic";
  return "Frantic";
}
