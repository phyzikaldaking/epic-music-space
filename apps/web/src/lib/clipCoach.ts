export type ClipCoachInput = {
  title?: string;
  caption?: string;
  hookText?: string;
  genre?: string;
  durationSeconds?: number;
  hasBeatDrop?: boolean;
  hasCrowdReaction?: boolean;
  hasCrownMoment?: boolean;
  hasTipMoment?: boolean;
  hasClearCTA?: boolean;
  energyLevel?: number;
};

export type ClipCoachSuggestion = {
  type: "fix" | "strength" | "opportunity";
  title: string;
  body: string;
  priority: number;
};

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function scoreClipVirality(input: ClipCoachInput) {
  let score = 35;
  const title = input.title?.trim() ?? "";
  const caption = input.caption?.trim() ?? "";
  const hook = input.hookText?.trim() ?? "";
  const duration = input.durationSeconds ?? 15;
  const energy = input.energyLevel ?? 50;

  if (hook.length >= 8) score += 12;
  if (title.length >= 8 && title.length <= 70) score += 8;
  if (caption.length >= 20 && caption.length <= 180) score += 7;
  if (duration >= 8 && duration <= 22) score += 10;
  if (input.hasBeatDrop) score += 10;
  if (input.hasCrowdReaction) score += 8;
  if (input.hasCrownMoment) score += 12;
  if (input.hasTipMoment) score += 7;
  if (input.hasClearCTA) score += 8;
  score += Math.min(12, Math.max(0, energy / 10));

  if (duration > 35) score -= 12;
  if (!hook) score -= 15;
  if (!input.hasClearCTA) score -= 6;
  if (energy < 35) score -= 10;

  return clampScore(score);
}

export function generateClipCoachSuggestions(input: ClipCoachInput): ClipCoachSuggestion[] {
  const suggestions: ClipCoachSuggestion[] = [];
  const score = scoreClipVirality(input);
  const title = input.title?.trim() ?? "";
  const caption = input.caption?.trim() ?? "";
  const hook = input.hookText?.trim() ?? "";
  const duration = input.durationSeconds ?? 15;
  const energy = input.energyLevel ?? 50;

  if (!hook) {
    suggestions.push({
      type: "fix",
      title: "Add a stronger first-second hook",
      body: "Start with the conflict: crown shift, beat drop, crowd shock, live tip, or a bold artist line. Do not ease into the clip.",
      priority: 100,
    });
  }

  if (duration > 35) {
    suggestions.push({
      type: "fix",
      title: "Cut the clip shorter",
      body: "Your clip is too long for short-form momentum. Aim for 8–22 seconds and remove everything before the moment hits.",
      priority: 95,
    });
  }

  if (!input.hasBeatDrop && !input.hasCrownMoment && !input.hasTipMoment) {
    suggestions.push({
      type: "fix",
      title: "Anchor the clip around a moment",
      body: "The algorithm needs a clear event. Add a beat drop, crown takeover, tip moment, or crowd reaction so viewers instantly know why it matters.",
      priority: 92,
    });
  }

  if (!input.hasClearCTA) {
    suggestions.push({
      type: "opportunity",
      title: "Add a clear action",
      body: "End with one direct action: license this track, tip the artist, watch the finals, or boost the contender.",
      priority: 82,
    });
  }

  if (energy >= 75) {
    suggestions.push({
      type: "strength",
      title: "Strong energy signal",
      body: "This clip has enough intensity for the viral feed. Keep the opening tight and make the moment obvious in the caption.",
      priority: 78,
    });
  }

  if (title.length > 70) {
    suggestions.push({
      type: "fix",
      title: "Shorten the title",
      body: "Keep the title under 70 characters. Use direct language: ‘BARI took the crown’ beats a long description.",
      priority: 70,
    });
  }

  if (caption.length < 20) {
    suggestions.push({
      type: "opportunity",
      title: "Make the caption do more work",
      body: "Add stakes, artist name, and action. Example: ‘BARI just took the crown in the EMS finals. Watch the room react.’",
      priority: 68,
    });
  }

  if (score >= 85) {
    suggestions.push({
      type: "strength",
      title: "High viral prediction",
      body: "This is strong enough to publish. Prioritize it for the viral feed and social export pipeline.",
      priority: 90,
    });
  }

  return suggestions.sort((a, b) => b.priority - a.priority);
}

export function buildOptimizedCaption(input: ClipCoachInput) {
  const artistOrGenre = input.genre ? `${input.genre} creator` : "EMS creator";
  if (input.hasCrownMoment) return `A ${artistOrGenre} just made a crown move on Epic Music Space. Watch the room react. #EpicMusicSpace #MusicCompetition`;
  if (input.hasTipMoment) return `Live tip energy changed the room. This ${artistOrGenre} moment is moving on Epic Music Space. #LiveMusic #CreatorEconomy`;
  if (input.hasBeatDrop) return `The beat drop hit and the crowd felt it. Tap in before this track climbs. #EpicMusicSpace #ViralMusic`;
  return `A new moment is moving on Epic Music Space. Watch, react, and see who takes control. #EpicMusicSpace`;
}
