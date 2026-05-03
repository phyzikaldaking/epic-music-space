export type HighlightEventType = "leader_change" | "tip" | "boost" | "crowd" | "finale" | "reaction";

export type HighlightInput = {
  eventType: HighlightEventType;
  title?: string;
  artist?: string;
  songId?: string;
  message?: string;
  crowdEnergy?: number;
  tipAmount?: number;
  powerDelta?: number;
  timestamp?: number;
};

export function scoreHighlight(input: HighlightInput) {
  const baseScores: Record<HighlightEventType, number> = {
    leader_change: 95,
    finale: 90,
    tip: 72,
    boost: 68,
    crowd: 52,
    reaction: 45,
  };

  const base = baseScores[input.eventType] ?? 40;
  const energyBonus = Math.min(25, Math.max(0, Number(input.crowdEnergy ?? 0) / 4));
  const tipBonus = Math.min(30, Math.max(0, Number(input.tipAmount ?? 0) * 1.5));
  const powerBonus = Math.min(20, Math.max(0, Number(input.powerDelta ?? 0) / 2));

  return Math.round(Math.min(100, base + energyBonus + tipBonus + powerBonus));
}

export function buildHighlightTitle(input: HighlightInput) {
  if (input.title) return input.title;
  switch (input.eventType) {
    case "leader_change":
      return `${input.artist ?? "A finalist"} took control of the crown`;
    case "tip":
      return `${input.artist ?? "An artist"} received a live tip`;
    case "boost":
      return `${input.artist ?? "A finalist"} triggered a boost surge`;
    case "finale":
      return "Season finale moment captured";
    default:
      return "Crowd energy spike captured";
  }
}

export function buildClipCaption(input: HighlightInput) {
  const title = buildHighlightTitle(input);
  return `${title}. Watch the energy move live on Epic Music Space. #EpicMusicSpace #MusicCompetition #LiveFinals`;
}
