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
