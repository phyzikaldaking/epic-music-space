export const PODCAST_FORMATS = ["VIDEO", "AUDIO", "HYBRID"] as const;
export const PODCAST_CADENCES = [
  "DAILY",
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "SEASONAL",
  "IRREGULAR",
] as const;
export const PODCAST_EPISODE_STATUSES = ["DRAFT", "SCHEDULED", "PUBLISHED", "ARCHIVED"] as const;
export const PODCAST_PRODUCTION_STATES = ["BLOCKED", "INGESTING", "TRANSCRIBING", "CLIPPING", "READY", "PUBLISHED"] as const;
export const PODCAST_PHASES = ["PRE_PRODUCTION", "RECORDING", "POST_PRODUCTION", "PUBLISH"] as const;

export type PodcastProductionState = (typeof PODCAST_PRODUCTION_STATES)[number];
export type PodcastPhase = (typeof PODCAST_PHASES)[number];

type EpisodeWorkflowInput = {
  status?: string;
  synopsis?: string | null;
  audioUrl?: string | null;
  muxUploadId?: string | null;
  muxPlaybackId?: string | null;
  videoStatus?: string | null;
  transcript?: string | null;
  captionsUrl?: string | null;
  clipCount?: number | null;
  coverUrl?: string | null;
  scheduledFor?: Date | string | null;
};

export type PodcastTemplate = {
  id: string;
  name: string;
  format: (typeof PODCAST_FORMATS)[number];
  cadence: (typeof PODCAST_CADENCES)[number];
  clipTarget: number;
  defaultChecklist: string[];
};

const DEFAULT_CHECKLIST = [
  "Run of show finalized",
  "Guest assets collected",
  "Audio levels verified",
  "Cover + thumbnail approved",
  "Clip strategy planned",
] as const;

export const DEFAULT_PODCAST_TEMPLATES: PodcastTemplate[] = [
  {
    id: "video-weekly",
    name: "Video Weekly",
    format: "VIDEO",
    cadence: "WEEKLY",
    clipTarget: 5,
    defaultChecklist: [...DEFAULT_CHECKLIST],
  },
  {
    id: "audio-daily",
    name: "Audio Daily",
    format: "AUDIO",
    cadence: "DAILY",
    clipTarget: 2,
    defaultChecklist: [...DEFAULT_CHECKLIST],
  },
  {
    id: "hybrid-interview",
    name: "Hybrid Interview",
    format: "HYBRID",
    cadence: "WEEKLY",
    clipTarget: 6,
    defaultChecklist: [...DEFAULT_CHECKLIST],
  },
];

export function slugifyPodcast(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[\"']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "podcast";
}

export function formatPodcastEnum(input: string) {
  return input
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatDurationLabel(totalSeconds: number | null | undefined) {
  if (!totalSeconds || totalSeconds <= 0) return "0m";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

export function derivePodcastBlockers(episode: EpisodeWorkflowInput) {
  const blockers: string[] = [];
  if (!episode.synopsis?.trim()) blockers.push("Add synopsis");
  if (!episode.audioUrl && !episode.muxPlaybackId && !episode.muxUploadId) blockers.push("Attach media");
  if (!episode.coverUrl?.trim()) blockers.push("Add cover art");
  if ((episode.status === "SCHEDULED" || episode.status === "PUBLISHED") && !episode.scheduledFor && episode.status === "SCHEDULED") {
    blockers.push("Set publish schedule");
  }
  return blockers;
}

export function derivePodcastProductionState(episode: EpisodeWorkflowInput): PodcastProductionState {
  if (episode.status === "PUBLISHED") return "PUBLISHED";
  const blockers = derivePodcastBlockers(episode);
  if (blockers.length > 0) return "BLOCKED";
  if (episode.videoStatus === "UPLOADING" || episode.videoStatus === "PROCESSING" || !!episode.muxUploadId) return "INGESTING";
  if (!episode.transcript?.trim() || !episode.captionsUrl) return "TRANSCRIBING";
  if ((episode.clipCount ?? 0) < 3) return "CLIPPING";
  return "READY";
}

export function canTransitionPodcastPhase(phase: PodcastPhase, episode: EpisodeWorkflowInput) {
  if (phase !== "PUBLISH") return { ok: true as const, reason: null };
  const blockers = derivePodcastBlockers(episode);
  if (blockers.length > 0) return { ok: false as const, reason: `Resolve blockers: ${blockers.join(", ")}` };
  return { ok: true as const, reason: null };
}

export function parseStoredTemplates(input: unknown): PodcastTemplate[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item): PodcastTemplate | null => {
      if (!item || typeof item !== "object") return null;
      const template = item as Partial<PodcastTemplate>;
      if (!template.id || !template.name) return null;
      const format = PODCAST_FORMATS.includes((template.format as (typeof PODCAST_FORMATS)[number]) ?? "VIDEO")
        ? (template.format as (typeof PODCAST_FORMATS)[number])
        : "VIDEO";
      const cadence = PODCAST_CADENCES.includes((template.cadence as (typeof PODCAST_CADENCES)[number]) ?? "WEEKLY")
        ? (template.cadence as (typeof PODCAST_CADENCES)[number])
        : "WEEKLY";
      return {
        id: String(template.id),
        name: String(template.name),
        format,
        cadence,
        clipTarget: Number(template.clipTarget ?? 3),
        defaultChecklist: Array.isArray(template.defaultChecklist)
          ? template.defaultChecklist.map((value) => String(value))
          : [...DEFAULT_CHECKLIST],
      };
    })
    .filter((value): value is PodcastTemplate => Boolean(value));
}
