export type FinishIssue = { code: string; message: string };
export type StudioHandoffDestination = "download" | "publish" | "marketplace" | "room" | "battle";
export type BattleExcerpt = { start: number; end: number };

export function validateStudioFinish(value: { missingMedia: number; clipping: boolean; saved: boolean; title: string }) {
  const blocking: FinishIssue[] = [];
  const warnings: FinishIssue[] = [];
  if (value.missingMedia) blocking.push({ code:"missing-media", message:`${value.missingMedia} source file(s) must be relinked.` });
  if (value.clipping) warnings.push({ code:"true-peak", message:"The mix may clip after encoding." });
  if (!value.saved) warnings.push({ code:"unsaved", message:"Save the latest changes before finishing." });
  if (!value.title.trim()) warnings.push({ code:"missing-title", message:"Add a title before publishing." });
  return { blocking, warnings, ready: blocking.length === 0 };
}

export function buildStudioHandoff(
  project: { id: string; title: string; updatedAt: string; tracks: number },
  destination: StudioHandoffDestination,
  options: { excerptStart?: number; excerptEnd?: number; format?: "wav" | "mp3" } = {},
) {
  const excerpt = destination === "battle" ? {
    start: Math.max(0, options.excerptStart ?? 0),
    end: Math.max(options.excerptStart ?? 0, options.excerptEnd ?? 60),
  } : undefined;
  return {
    schemaVersion: 1 as const,
    destination,
    projectId: project.id,
    title: project.title,
    sourceVersion: project.updatedAt,
    trackCount: project.tracks,
    reviewRequired: true as const,
    format: options.format ?? "wav",
    excerpt,
  };
}

export function parseStudioHandoff(value: string) {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (parsed.schemaVersion !== 1 || parsed.reviewRequired !== true || typeof parsed.projectId !== "string" || typeof parsed.destination !== "string") return null;
    return parsed as ReturnType<typeof buildStudioHandoff>;
  } catch {
    return null;
  }
}

export function getDestinationPath(destination: Exclude<StudioHandoffDestination, "download">) {
  return {
    publish: "/studio/new?source=studio",
    marketplace: "/market/list?source=studio",
    room: "/rooms/new?source=studio",
    battle: "/versus/new?source=studio",
  }[destination];
}
