import { getAiStudioRole, type AiStudioRoleId } from "./aiStudioRoles";

export type RecordingAssistantStage =
  | "idle"
  | "mic_check"
  | "gain_staging"
  | "recording"
  | "take_review"
  | "mix_prep";

export type RecordingAssistantInput = {
  stage: RecordingAssistantStage;
  inputLevel?: number;
  noiseFloor?: number;
  isClipping?: boolean;
  takeCount?: number;
  lastTakeDurationSec?: number;
  artistGoal?: string;
};

export type RecordingAssistantStep = {
  stage: RecordingAssistantStage;
  headline: string;
  instruction: string;
  severity: "info" | "success" | "warning" | "danger";
  nextAction: string;
};

export type VoiceCommandIntent =
  | "record_start"
  | "record_stop"
  | "punch_in"
  | "mute_track"
  | "solo_track"
  | "save_version"
  | "open_mix"
  | "open_publish"
  | "unknown";

export type VoiceCommandResult = {
  intent: VoiceCommandIntent;
  confidence: number;
  normalized: string;
  response: string;
};

export type MixAnalysisInput = {
  vocalLevel?: number;
  beatLevel?: number;
  bassLevel?: number;
  masterTruePeak?: number;
  masterLufs?: number;
  phaseCorrelation?: number;
};

export type MixSuggestion = {
  area: "vocal" | "low_end" | "master" | "stereo" | "workflow";
  issue: string;
  fix: string;
  priority: "low" | "medium" | "high";
};

export type MasteringExportTarget = "streaming" | "club" | "performance" | "battle" | "tiktok" | "broadcast" | "sync";

export type MasteringExportPlan = {
  target: MasteringExportTarget;
  loudnessTarget: string;
  truePeakTarget: string;
  checklist: string[];
  warning?: string;
};

export type PublishingPlanInput = {
  title?: string;
  artistName?: string;
  collaborators?: string[];
  hasCoverArt?: boolean;
  hasSplits?: boolean;
  isCleanVersionReady?: boolean;
  target?: "marketplace" | "streaming" | "battle" | "sync";
};

export type PublishingPlan = {
  readiness: "not_ready" | "needs_review" | "ready";
  missing: string[];
  nextSteps: string[];
  promoAngles: string[];
};

export type AiStudioMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  aiRoleId?: AiStudioRoleId;
};

export function nextRecordingAssistantStep(input: RecordingAssistantInput): RecordingAssistantStep {
  if (input.isClipping || (input.inputLevel ?? 0) > 0.92) {
    return {
      stage: "gain_staging",
      headline: "Input is too hot",
      instruction: "Turn your interface gain down or back away from the mic. Record another test before the real take.",
      severity: "danger",
      nextAction: "Run another level check",
    };
  }

  if ((input.noiseFloor ?? 0) > 0.18) {
    return {
      stage: "mic_check",
      headline: "Room noise is high",
      instruction: "Kill fans, TVs, AC rumble, and background noise. Move closer to the mic so your voice beats the room.",
      severity: "warning",
      nextAction: "Fix room noise",
    };
  }

  if (input.stage === "idle") {
    return {
      stage: "mic_check",
      headline: "Start with a mic check",
      instruction: "Say your loudest line into the mic. The AI Engineer will check level, noise, and clipping risk before you record.",
      severity: "info",
      nextAction: "Start mic check",
    };
  }

  if (input.stage === "mic_check" || input.stage === "gain_staging") {
    return {
      stage: "recording",
      headline: "Ready for a clean take",
      instruction: "Keep the same distance from the mic, leave emotion in the vocal, and do not touch the gain knob mid-take.",
      severity: "success",
      nextAction: "Record take",
    };
  }

  if (input.stage === "recording") {
    return {
      stage: "take_review",
      headline: "Review the take",
      instruction: "Listen for clipped words, weak endings, breath control, and timing. Keep the best take or punch the weak bars.",
      severity: "info",
      nextAction: "Review take",
    };
  }

  return {
    stage: "mix_prep",
    headline: "Prep for mix",
    instruction: "Label the best take, mute dead takes, keep adlibs separate, and send the vocal to the clean vocal chain.",
    severity: "success",
    nextAction: "Open Pro Mix",
  };
}

export function parseVoiceCommand(raw: string): VoiceCommandResult {
  const normalized = raw.trim().toLowerCase();
  const match = (intent: VoiceCommandIntent, response: string, confidence = 0.86): VoiceCommandResult => ({ intent, confidence, normalized, response });

  if (/\b(start|begin|record)\b.*\b(record|take|vocals?)\b/.test(normalized)) {
    return match("record_start", "Starting a recording flow with count-in and level safety checks.");
  }
  if (/\b(stop|end|finish)\b.*\b(record|take|recording)\b/.test(normalized)) {
    return match("record_stop", "Stopping the current recording and moving to take review.");
  }
  if (/\b(punch|drop)\b.*\b(in|bar|line|verse)\b/.test(normalized)) {
    return match("punch_in", "Preparing a punch-in workflow for the selected section.");
  }
  if (/\bmute\b/.test(normalized)) return match("mute_track", "Muting the requested track after confirmation.", 0.72);
  if (/\bsolo\b/.test(normalized)) return match("solo_track", "Soloing the requested track after confirmation.", 0.72);
  if (/\b(save|snapshot|version)\b/.test(normalized)) return match("save_version", "Saving a named studio version.", 0.78);
  if (/\b(mix|mixer|console)\b/.test(normalized)) return match("open_mix", "Opening the professional mix window.", 0.82);
  if (/\b(publish|release|drop)\b/.test(normalized)) return match("open_publish", "Opening release and publishing guidance.", 0.78);

  return {
    intent: "unknown",
    confidence: 0.25,
    normalized,
    response: "I did not understand that studio command yet. Try: start recording, punch in, open mix, save version, or publish this song.",
  };
}

export function analyzeMix(input: MixAnalysisInput): MixSuggestion[] {
  const suggestions: MixSuggestion[] = [];
  const vocal = input.vocalLevel ?? 0;
  const beat = input.beatLevel ?? 0;
  const bass = input.bassLevel ?? 0;
  const lufs = input.masterLufs ?? -Infinity;
  const peak = input.masterTruePeak ?? 0;
  const phase = input.phaseCorrelation ?? 1;

  if (vocal > 0 && beat > 0 && vocal < beat * 0.45) {
    suggestions.push({ area: "vocal", issue: "Vocal is buried under the beat", fix: "Raise vocal 2-3 dB or pull the beat bus down 1-2 dB before compression.", priority: "high" });
  }
  if (bass > 0.7 && beat > 0.55) {
    suggestions.push({ area: "low_end", issue: "808/bass may be masking the kick and beat", fix: "Cut mud around 120-250 Hz and check the 808 fundamental against the kick.", priority: "medium" });
  }
  if (peak > 0.96) {
    suggestions.push({ area: "master", issue: "Master is close to clipping", fix: "Lower master trim or limiter input before export. Target true peak around -1 dBTP.", priority: "high" });
  }
  if (Number.isFinite(lufs) && lufs < -18) {
    suggestions.push({ area: "master", issue: "Mix is quiet for modern release targets", fix: "Gain stage into the master bus and compare against a reference before limiting.", priority: "medium" });
  }
  if (phase < 0.2) {
    suggestions.push({ area: "stereo", issue: "Stereo phase is risky", fix: "Check mono compatibility and reduce stereo widening on low-frequency or vocal buses.", priority: "high" });
  }
  if (!suggestions.length) {
    suggestions.push({ area: "workflow", issue: "No major red flags detected", fix: "Save a version, compare a reference, and prepare alternate masters.", priority: "low" });
  }

  return suggestions;
}

export function createMasteringExportPlan(target: MasteringExportTarget): MasteringExportPlan {
  const shared = ["Check clipping before export", "Confirm song title and version label", "Export WAV and marketplace preview MP3"];
  const plans: Record<MasteringExportTarget, MasteringExportPlan> = {
    streaming: { target, loudnessTarget: "~ -14 LUFS integrated", truePeakTarget: "-1.0 dBTP", checklist: ["Use streaming master chain", "Avoid over-limiting", ...shared] },
    club: { target, loudnessTarget: "~ -9 to -10 LUFS integrated", truePeakTarget: "-0.8 dBTP", checklist: ["Prioritize impact", "Check low-end translation", ...shared], warning: "Club masters can distort on streaming if reused without adjustment." },
    performance: { target, loudnessTarget: "~ -12 LUFS integrated", truePeakTarget: "-1.0 dBTP", checklist: ["Keep lead vocal clear", "Export performance track with hooks/adlibs as needed", ...shared] },
    battle: { target, loudnessTarget: "~ -10 LUFS integrated", truePeakTarget: "-1.0 dBTP", checklist: ["Make first 30 seconds hit immediately", "Check vocal aggression and intelligibility", ...shared] },
    tiktok: { target, loudnessTarget: "~ -13 LUFS integrated", truePeakTarget: "-1.0 dBTP", checklist: ["Identify best 15-second clip", "Make hook hit early", ...shared] },
    broadcast: { target, loudnessTarget: "~ -16 LUFS integrated", truePeakTarget: "-2.0 dBTP", checklist: ["Use safer true peak", "Check clean edit", ...shared] },
    sync: { target, loudnessTarget: "~ -14 to -16 LUFS integrated", truePeakTarget: "-1.5 dBTP", checklist: ["Export instrumental", "Export clean", "Confirm stems and metadata", ...shared] },
  };
  return plans[target];
}

export function createPublishingPlan(input: PublishingPlanInput): PublishingPlan {
  const missing: string[] = [];
  if (!input.title?.trim()) missing.push("song title");
  if (!input.artistName?.trim()) missing.push("artist name");
  if (!input.hasCoverArt) missing.push("cover art");
  if (!input.hasSplits) missing.push("split sheet / collaborator credits");
  if (!input.isCleanVersionReady && input.target !== "battle") missing.push("clean version");

  const readiness = missing.length === 0 ? "ready" : missing.length <= 2 ? "needs_review" : "not_ready";
  return {
    readiness,
    missing,
    nextSteps: missing.length
      ? missing.map((item) => `Complete ${item} before publishing.`)
      : ["Save a final version", "Export release master", "Publish to EMS marketplace", "Generate promo clips"],
    promoAngles: [
      "Behind-the-scenes studio clip",
      "Hook-first short-form teaser",
      "AI Engineer helped build this session",
      "Marketplace-ready release preview",
    ],
  };
}

export function createAiStudioSystemPrompt(roleId: AiStudioRoleId): string {
  const role = getAiStudioRole(roleId);
  return [
    `You are the ${role.name} inside Epic Music Space.`,
    role.promise,
    "Speak like a professional studio operator: direct, practical, and artist-friendly.",
    "Prioritize safe, clear steps artists can execute immediately.",
    "Do not pretend to hear audio unless metrics or analysis data are provided.",
    "When uncertain, ask for one concrete signal: input level, track type, goal, or export target.",
  ].join(" ");
}
