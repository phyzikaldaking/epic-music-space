import type { AiStudioRoleId } from "./aiStudioRoles";
import { nextRecordingAssistantStep, type RecordingAssistantInput, type RecordingAssistantStep } from "./aiStudioEngine";

export type AiSessionMemoryItem = {
  id: string;
  type: "artist_goal" | "session_fact" | "mix_note" | "recording_note" | "publishing_note";
  content: string;
  importance: "low" | "medium" | "high";
  createdAt: string;
  roleId?: AiStudioRoleId;
};

export type AiSessionMemoryState = {
  sessionId: string;
  songTitle?: string;
  artistName?: string;
  bpm?: number;
  key?: string;
  activeRoleId: AiStudioRoleId;
  items: AiSessionMemoryItem[];
};

export type RecordingFeedbackInput = RecordingAssistantInput & {
  vocalPeak?: number;
  averageLevel?: number;
  breathNoiseRisk?: number;
  takeLabel?: string;
};

export type RecordingFeedback = {
  assistantStep: RecordingAssistantStep;
  headline: string;
  bullets: string[];
  shouldRetake: boolean;
  shouldPunchIn: boolean;
  memoryItems: AiSessionMemoryItem[];
};

function nowIso(): string {
  return new Date().toISOString();
}

function makeMemory(type: AiSessionMemoryItem["type"], content: string, importance: AiSessionMemoryItem["importance"], roleId?: AiStudioRoleId): AiSessionMemoryItem {
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    content,
    importance,
    roleId,
    createdAt: nowIso(),
  };
}

export function createInitialAiSessionMemory(input: Partial<AiSessionMemoryState> = {}): AiSessionMemoryState {
  return {
    sessionId: input.sessionId ?? `ems-session-${Date.now()}`,
    songTitle: input.songTitle,
    artistName: input.artistName,
    bpm: input.bpm,
    key: input.key,
    activeRoleId: input.activeRoleId ?? "engineer",
    items: input.items ?? [],
  };
}

export function addAiSessionMemoryItem(state: AiSessionMemoryState, item: Omit<AiSessionMemoryItem, "id" | "createdAt">): AiSessionMemoryState {
  const nextItem = makeMemory(item.type, item.content, item.importance, item.roleId);
  return {
    ...state,
    items: [nextItem, ...state.items].slice(0, 40),
  };
}

export function summarizeAiSessionMemory(state: AiSessionMemoryState): string {
  const facts = state.items
    .slice(0, 12)
    .map((item) => `- [${item.type}/${item.importance}] ${item.content}`)
    .join("\n");

  return [
    `Session: ${state.sessionId}`,
    state.songTitle ? `Song: ${state.songTitle}` : null,
    state.artistName ? `Artist: ${state.artistName}` : null,
    typeof state.bpm === "number" ? `BPM: ${state.bpm}` : null,
    state.key ? `Key: ${state.key}` : null,
    `Active AI role: ${state.activeRoleId}`,
    facts ? `Remembered context:\n${facts}` : "No remembered context yet.",
  ].filter(Boolean).join("\n");
}

export function createRecordingFeedback(input: RecordingFeedbackInput): RecordingFeedback {
  const assistantStep = nextRecordingAssistantStep(input);
  const bullets: string[] = [];
  const memoryItems: AiSessionMemoryItem[] = [];
  const inputLevel = input.inputLevel ?? 0;
  const averageLevel = input.averageLevel ?? inputLevel;
  const peak = input.vocalPeak ?? inputLevel;
  const noise = input.noiseFloor ?? 0;
  const breathRisk = input.breathNoiseRisk ?? 0;

  if (input.isClipping || peak > 0.92) {
    bullets.push("Vocal is clipping or too close to clipping. Lower input gain before recording the next take.");
    memoryItems.push(makeMemory("recording_note", "Vocal clipping risk detected during recording.", "high", "engineer"));
  }

  if (averageLevel > 0 && averageLevel < 0.16) {
    bullets.push("Average vocal level is low. Move closer to the mic or raise preamp gain slightly before the next take.");
    memoryItems.push(makeMemory("recording_note", "Average vocal level was low; AI Engineer should coach stronger gain staging.", "medium", "engineer"));
  }

  if (noise > 0.18) {
    bullets.push("Room noise is high. Kill background noise and get the vocal closer to the mic.");
    memoryItems.push(makeMemory("recording_note", "High room-noise risk detected.", "medium", "engineer"));
  }

  if (breathRisk > 0.7) {
    bullets.push("Breath/noise risk is high. Use better mic angle and leave space before punch-ins.");
    memoryItems.push(makeMemory("recording_note", "Breath or mouth-noise risk was high on the take.", "medium", "engineer"));
  }

  if (!bullets.length) {
    bullets.push("Take is technically clean enough to review for performance, timing, and emotion.");
    memoryItems.push(makeMemory("recording_note", "Recording take passed basic technical checks.", "low", "engineer"));
  }

  const shouldRetake = Boolean(input.isClipping || peak > 0.94 || noise > 0.28);
  const shouldPunchIn = !shouldRetake && Boolean(input.lastTakeDurationSec && input.lastTakeDurationSec > 12 && (breathRisk > 0.65 || averageLevel < 0.14));

  return {
    assistantStep,
    headline: shouldRetake ? "Retake recommended" : shouldPunchIn ? "Punch-in recommended" : "Take is usable",
    bullets,
    shouldRetake,
    shouldPunchIn,
    memoryItems,
  };
}
