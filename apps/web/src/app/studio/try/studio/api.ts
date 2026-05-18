import type {
  StudioApiProject,
  StudioRecentProject,
  StudioSavedSession,
  StudioTrack,
} from "./types";
import { visibleClipDuration } from "./timeline";

export async function studioFetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      typeof body.error === "string"
        ? body.error
        : "Studio cloud request failed.",
    );
  }

  return body as T;
}

export function buildPersistableTracks(tracks: StudioTrack[]) {
  return tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => ({
      ...clip,
      url: clip.url.startsWith("blob:") ? "" : clip.url,
      missing: !clip.url || clip.url.startsWith("blob:"),
    })),
  }));
}

export function restorePersistedTracks(tracks: StudioTrack[]) {
  return tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => ({
      ...clip,
      url: clip.url || "",
      missing: !clip.url,
    })),
  }));
}

export function toStudioProjectPayload(
  saved: StudioSavedSession,
  forceNew: boolean,
) {
  const tracks = saved.tracks.map((track, position) => ({
    id: track.id,
    name: track.name,
    color: track.color,
    blobUrl:
      track.clips.find(
        (clip) => clip.url && !clip.url.startsWith("blob:"),
      )?.url ?? null,
    durationSec: Math.max(
      0,
      ...track.clips.map(
        (clip) => clip.start + visibleClipDuration(clip),
      ),
    ),
    position,
  }));

  return {
    id: forceNew ? undefined : saved.id,
    name: saved.title,
    bpm: Math.round(saved.bpm),
    patternJson: saved,
    thumbnailPeaks: saved.tracks
      .flatMap((track) => track.clips[0]?.peaks ?? [])
      .slice(0, 120),
    tracks,
  };
}

export function studioProjectToSession(
  project: StudioApiProject,
): StudioSavedSession {
  const pattern = project.patternJson as
    | Partial<StudioSavedSession>
    | null
    | undefined;

  if (pattern?.tracks) {
    return {
      ...pattern,
      id: project.id,
      title: project.name,
      bpm: project.bpm,
      updatedAt: project.updatedAt,
    } as StudioSavedSession;
  }

  return {
    id: project.id,
    title: project.name,
    bpm: project.bpm,
    sampleRate: 48000,
    updatedAt: project.updatedAt,
    tracks: [],
    snapshots: [],
  };
}

export async function fetchRecentStudioProjects() {
  const data = await studioFetchJson<{
    projects: StudioApiProject[];
  }>("/api/studio/projects");

  return data.projects.map(
    (project): StudioRecentProject => ({
      id: project.id,
      title: project.name,
      updatedAt: project.updatedAt,
    }),
  );
}
