import type { StudioSavedSession } from "./types";

export type RecoveryMediaDescriptor = {
  sourceId: string;
  fileName: string;
  sizeBytes: number;
  durationSec: number;
  status: "available" | "missing";
  remoteUrl?: string;
};

export type StudioRecoveryManifest = {
  schemaVersion: 4;
  projectId: string;
  updatedAt: string;
  project: StudioSavedSession;
  media: RecoveryMediaDescriptor[];
};

export function isRecoveryManifest(value: unknown): value is StudioRecoveryManifest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StudioRecoveryManifest>;
  return candidate.schemaVersion === 4
    && typeof candidate.projectId === "string"
    && typeof candidate.updatedAt === "string"
    && Boolean(candidate.project && Array.isArray(candidate.project.tracks))
    && Array.isArray(candidate.media)
    && candidate.media.every((item) => Boolean(
      item
      && typeof item.sourceId === "string"
      && typeof item.fileName === "string"
      && (item.status === "available" || item.status === "missing"),
    ));
}

export function createRecoveryManifest(project: StudioSavedSession): StudioRecoveryManifest {
  const bySource = new Map<string, RecoveryMediaDescriptor>();
  for (const clip of project.tracks.flatMap((track) => track.clips)) {
    const sourceId = clip.sourceId ?? clip.id;
    const temporary = clip.url.startsWith("blob:");
    const available = Boolean(clip.url) && !temporary && !clip.missing;
    if (!bySource.has(sourceId)) bySource.set(sourceId, {
      sourceId,
      fileName: clip.name,
      sizeBytes: clip.size,
      durationSec: clip.duration,
      status: available ? "available" : "missing",
      ...(available ? { remoteUrl: clip.url } : {}),
    });
  }
  const sanitizedProject: StudioSavedSession = {
    ...project,
    tracks: project.tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => ({ ...clip, url: clip.url.startsWith("blob:") ? "" : clip.url, missing: clip.missing || clip.url.startsWith("blob:") })) })),
  };
  return { schemaVersion: 4, projectId: project.id, updatedAt: project.updatedAt, project: sanitizedProject, media: [...bySource.values()].sort((left, right) => left.sourceId.localeCompare(right.sourceId)) };
}

export function migrateRecoveryManifest(value: StudioRecoveryManifest | { schemaVersion: 3; projectId: string; updatedAt: string; project: StudioSavedSession }): StudioRecoveryManifest {
  if (value.schemaVersion === 4) return value;
  return createRecoveryManifest({ ...value.project, id: value.projectId, updatedAt: value.updatedAt });
}

export function compareRecoveryManifests(local: StudioRecoveryManifest, cloud: StudioRecoveryManifest) {
  const localTime = Date.parse(local.updatedAt);
  const cloudTime = Date.parse(cloud.updatedAt);
  const recommended = Number.isFinite(localTime) && (!Number.isFinite(cloudTime) || localTime >= cloudTime) ? "local" : "cloud";
  return { local, cloud, recommended } as const;
}

export function preserveBothRecovery(manifest: StudioRecoveryManifest, recoveredAt = new Date().toISOString()): StudioRecoveryManifest {
  const suffix = recoveredAt.toLowerCase().replace(/[^a-z0-9]/g, "");
  const id = `${manifest.projectId}-recovered-${suffix}`;
  return createRecoveryManifest({ ...manifest.project, id, title: `${manifest.project.title} — Recovered Copy`, updatedAt: recoveredAt });
}
