import { buildOptimizedCaption, generateClipCoachSuggestions, scoreClipVirality } from "@/lib/clipCoach";

export type SongClipSource = {
  songId: string;
  title: string;
  artist: string;
  genre?: string | null;
  bpm?: number | null;
  durationSeconds?: number | null;
  energyScore?: number | null;
  beatDropTimestamps?: number[];
  hookTimestamps?: number[];
  crowdReactionTimestamps?: number[];
  crownMomentTimestamps?: number[];
  tipMomentTimestamps?: number[];
};

export type AutoClipMoment = {
  id: string;
  songId: string;
  startTime: number;
  durationSeconds: number;
  momentType: "beat_drop" | "hook" | "crowd" | "crown" | "tip" | "energy_peak";
  title: string;
  caption: string;
  viralScore: number;
  coachSuggestions: ReturnType<typeof generateClipCoachSuggestions>;
};

function uniqueMoments(timestamps: Array<{ time: number; type: AutoClipMoment["momentType"] }>) {
  const sorted = timestamps
    .filter((item) => Number.isFinite(item.time) && item.time >= 0)
    .sort((a, b) => a.time - b.time);

  const result: typeof sorted = [];
  for (const item of sorted) {
    const tooClose = result.some((existing) => Math.abs(existing.time - item.time) < 6);
    if (!tooClose) result.push(item);
  }
  return result.slice(0, 12);
}

function estimateFallbackMoments(song: SongClipSource) {
  const duration = song.durationSeconds ?? 150;
  const safeDuration = Math.max(45, duration);
  return [
    { time: Math.max(0, Math.round(safeDuration * 0.12)), type: "hook" as const },
    { time: Math.max(0, Math.round(safeDuration * 0.28)), type: "beat_drop" as const },
    { time: Math.max(0, Math.round(safeDuration * 0.52)), type: "energy_peak" as const },
    { time: Math.max(0, Math.round(safeDuration * 0.72)), type: "hook" as const },
  ];
}

function buildTitle(song: SongClipSource, type: AutoClipMoment["momentType"]) {
  switch (type) {
    case "beat_drop":
      return `${song.artist} beat drop hit different`;
    case "crown":
      return `${song.artist} made a crown move`;
    case "tip":
      return `${song.artist} caught live tip energy`;
    case "crowd":
      return `${song.artist} had the crowd reacting`;
    case "energy_peak":
      return `${song.artist} energy spike on ${song.title}`;
    default:
      return `${song.artist} hook moment from ${song.title}`;
  }
}

export function generateAutoClips(song: SongClipSource, limit = 5): AutoClipMoment[] {
  const candidates = uniqueMoments([
    ...(song.beatDropTimestamps ?? []).map((time) => ({ time, type: "beat_drop" as const })),
    ...(song.hookTimestamps ?? []).map((time) => ({ time, type: "hook" as const })),
    ...(song.crowdReactionTimestamps ?? []).map((time) => ({ time, type: "crowd" as const })),
    ...(song.crownMomentTimestamps ?? []).map((time) => ({ time, type: "crown" as const })),
    ...(song.tipMomentTimestamps ?? []).map((time) => ({ time, type: "tip" as const })),
    ...estimateFallbackMoments(song),
  ]);

  const energy = Math.max(35, Math.min(100, song.energyScore ?? (song.bpm ? Math.min(95, song.bpm / 1.7) : 65)));

  return candidates
    .map((candidate, index) => {
      const clipInput = {
        title: buildTitle(song, candidate.type),
        hookText: candidate.type === "hook" ? "The hook hits immediately" : "The moment starts instantly",
        caption: `${song.artist} just created a ${candidate.type.replace("_", " ")} moment on Epic Music Space.`,
        genre: song.genre ?? undefined,
        durationSeconds: candidate.type === "hook" ? 18 : 15,
        hasBeatDrop: candidate.type === "beat_drop" || candidate.type === "energy_peak",
        hasCrowdReaction: candidate.type === "crowd",
        hasCrownMoment: candidate.type === "crown",
        hasTipMoment: candidate.type === "tip",
        hasClearCTA: true,
        energyLevel: energy + (candidate.type === "beat_drop" ? 8 : 0) + (candidate.type === "crown" ? 10 : 0),
      };

      const viralScore = scoreClipVirality(clipInput);
      return {
        id: `auto_${song.songId}_${index}_${candidate.type}`,
        songId: song.songId,
        startTime: Math.max(0, Math.round(candidate.time - 2)),
        durationSeconds: clipInput.durationSeconds,
        momentType: candidate.type,
        title: clipInput.title,
        caption: buildOptimizedCaption(clipInput),
        viralScore,
        coachSuggestions: generateClipCoachSuggestions(clipInput).slice(0, 4),
      } satisfies AutoClipMoment;
    })
    .sort((a, b) => b.viralScore - a.viralScore)
    .slice(0, limit);
}
