import type {
  StudioApiProject,
  StudioProductionAudioFile,
  StudioProductionClip,
  StudioProductionProjectResponse,
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
    throw Object.assign(new Error(
      typeof body.error === "string"
        ? body.error
        : "Studio cloud request failed.",
    ), { status: res.status });
  }

  return body as T;
}

export async function withStudioGuestMediaFallback<T>(cloudUpload: () => Promise<T>, localUpload: () => T | Promise<T>): Promise<T> {
  try {
    return await cloudUpload();
  } catch (error) {
    if (error instanceof Error && "status" in error && error.status === 401) return localUpload();
    throw error;
  }
}

function parsePeakArray(value: unknown): number[] {
  if (Array.isArray(value)) return value.filter((item): item is number => typeof item === "number");
  if (typeof value !== "string" || value.trim().length === 0) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is number => typeof item === "number") : [];
  } catch {
    return [];
  }
}

function audioUrl(audio?: StudioProductionAudioFile) {
  return audio?.storageUrl ?? audio?.blobUrl ?? audio?.url ?? "";
}

function audioName(audio?: StudioProductionAudioFile) {
  return audio?.originalName ?? audio?.fileName ?? "Audio Clip";
}

export function buildPersistableTracks(tracks: StudioTrack[]) {
  return tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => ({
      ...clip,
      sourceId: clip.sourceId ?? clip.id,
      url: clip.url.startsWith("blob:") ? "" : clip.url,
      missing: !clip.url || clip.url.startsWith("blob:"),
    })),
  }));
}

export function serializeStudioSession(saved: StudioSavedSession): StudioSavedSession {
  return {
    ...saved,
    schemaVersion: 4,
    tracks: buildPersistableTracks(saved.tracks),
    snapshots: saved.snapshots.map((snapshot) => ({
      ...snapshot,
      tracks: buildPersistableTracks(snapshot.tracks),
    })),
  };
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
  const serialized = serializeStudioSession(saved);
  const clips = serialized.tracks.flatMap((track) =>
    track.clips
      .filter((clip) => clip.url && !clip.url.startsWith("blob:") && clip.sourceId && clip.sourceId !== clip.id)
      .map((clip) => ({
        id: clip.id,
        trackId: track.id,
        name: clip.name,
        audioFileId: clip.sourceId,
        startSec: clip.start,
        durationSec: visibleClipDuration(clip),
        trimStartSec: clip.trimStart,
        trimEndSec: clip.trimEnd,
        gainDb: clip.gain,
        muted: clip.muted,
        locked: clip.locked,
        color: clip.color,
        peaks: clip.peaks,
        metadata: { source: "studio-session-save" },
      })),
  );

  const tracks = serialized.tracks.map((track, position) => ({
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
    patternJson: serialized,
    thumbnailPeaks: saved.tracks
      .flatMap((track) => track.clips[0]?.peaks ?? [])
      .slice(0, 120),
    tracks,
    clips,
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

export function productionProjectToSession(
  data: StudioProductionProjectResponse,
): StudioSavedSession {
  const fallback = studioProjectToSession(data.project);
  const savedById = new Map(fallback.tracks.map((track) => [track.id, track]));
  const audioById = new Map(data.audioFiles.map((audio) => [audio.id, audio]));
  const clipsByTrack = new Map<string, StudioProductionClip[]>();

  for (const clip of data.clips) {
    const key = clip.trackId ?? "__missing_track__";
    const list = clipsByTrack.get(key) ?? [];
    list.push(clip);
    clipsByTrack.set(key, list);
  }

  const tracks: StudioTrack[] = data.tracks.map((track, index) => {
    const savedTrack = track.id ? savedById.get(track.id) : undefined;
    const productionClips = track.id ? clipsByTrack.get(track.id) ?? [] : [];
    const clips = productionClips.map((clip) => {
      const audio = clip.audioFileId ? audioById.get(clip.audioFileId) : undefined;
      const url = audioUrl(audio);
      const peaks = parsePeakArray(
        clip.waveformPeaks ?? clip.peaksJson ?? audio?.waveformPeaks ?? audio?.peaksJson,
      );
      const savedClip = savedTrack?.clips.find((item) => item.id === clip.id);

      return {
        ...savedClip,
        id: clip.id,
        name: clip.name ?? savedClip?.name ?? audioName(audio),
        url,
        type: audio?.mimeType ?? savedClip?.type ?? "audio/*",
        size: audio?.sizeBytes ?? savedClip?.size ?? 0,
        duration: clip.durationSec ?? audio?.durationSec ?? savedClip?.duration ?? 0,
        peaks: peaks.length ? peaks : savedClip?.peaks ?? [],
        start: clip.startSec ?? savedClip?.start ?? 0,
        trimStart: clip.trimStartSec ?? savedClip?.trimStart ?? 0,
        trimEnd: clip.trimEndSec ?? savedClip?.trimEnd ?? 0,
        fadeIn: savedClip?.fadeIn ?? 0,
        fadeOut: savedClip?.fadeOut ?? 0,
        gain: clip.gainDb ?? savedClip?.gain ?? 0,
        muted: clip.muted ?? savedClip?.muted ?? false,
        locked: clip.locked ?? savedClip?.locked ?? false,
        missing: !url,
        color: clip.color ?? savedClip?.color ?? track.color,
        sourceId: clip.audioFileId ?? savedClip?.sourceId ?? clip.id,
      };
    });

    return {
      ...savedTrack,
      id: track.id ?? savedTrack?.id ?? `track-${index + 1}`,
      name: track.name ?? savedTrack?.name ?? `Track ${index + 1}`,
      color: track.color ?? savedTrack?.color ?? "#65d6ff",
      armed: track.armed ?? savedTrack?.armed ?? index === 0,
      muted: track.muted ?? savedTrack?.muted ?? false,
      solo: track.solo ?? savedTrack?.solo ?? false,
      volume: track.volume ?? savedTrack?.volume ?? 78,
      pan: track.pan ?? savedTrack?.pan ?? 0,
      inputGain: track.inputGain ?? savedTrack?.inputGain ?? 60,
      clips: clips.length ? clips : savedTrack?.clips ?? [],
    };
  });

  return {
    ...fallback,
    id: data.project.id,
    title: data.project.name,
    bpm: data.project.bpm,
    sampleRate: fallback.sampleRate ?? 48000,
    updatedAt: data.project.updatedAt,
    tracks,
    snapshots: fallback.snapshots ?? [],
  };
}

export async function fetchProductionStudioSession(projectId: string) {
  const data = await studioFetchJson<StudioProductionProjectResponse>(
    `/api/studio/projects/${projectId}/production`,
  );
  return productionProjectToSession(data);
}

export async function fetchRecentStudioProjects() {
  let data: { projects: StudioApiProject[] };
  try {
    data = await studioFetchJson<{ projects: StudioApiProject[] }>("/api/studio/projects");
  } catch (error) {
    if (error instanceof Error && "status" in error && error.status === 401) return [];
    throw error;
  }

  return data.projects.map(
    (project): StudioRecentProject => ({
      id: project.id,
      title: project.name,
      updatedAt: project.updatedAt,
    }),
  );
}
