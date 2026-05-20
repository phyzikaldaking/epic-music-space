/**
 * IndexedDB-backed project storage for the EMS DAW. One database, one
 * object store keyed by project id. Stores the entire ProjectFile
 * (audio blobs included — IDB handles them natively without base64
 * roundtripping, which is critical for keeping save/load fast).
 *
 * Why IDB and not localStorage:
 *   • localStorage caps around 5MB and is sync — would block the main
 *     thread when reading a project with several recorded takes.
 *   • IDB has no practical size limit (browser quota), is async, and
 *     stores Blobs without serialization.
 *
 * Why no library: we're using a tiny subset (one CRUD store), and a
 * dependency would dwarf the implementation.
 */

import type { ProjectFile } from "./dawEngine";
import { DRUM_LANES, emptyPattern, type DrumKind, type DrumKitId } from "./beatMachine";

const DB_NAME = "ems-daw";
// Bumped to 2 when the undoSnapshots store was added (see undoStorage.ts).
// Both files run upgrades against the same shared DB; whichever opens
// first triggers the upgrade for any missing stores.
const DB_VERSION = 3;
const STORE = "projects";
const STORE_UNDO = "undoSnapshots";
const STORE_REDO = "redoSnapshots";

export interface StoredProject {
  id: string;
  name: string;
  savedAt: string;
  trackCount: number;
  /** Approximate stored size in bytes — sum of audio blob sizes. */
  approxBytes: number;
  source?: "local" | "cloud";
  /** The full project file. Heavy — only fetched when loading. */
  file?: ProjectFile;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("savedAt", "savedAt");
      }
      if (!db.objectStoreNames.contains(STORE_UNDO)) {
        const undo = db.createObjectStore(STORE_UNDO, { keyPath: "id", autoIncrement: true });
        undo.createIndex("projectId", "projectId");
        undo.createIndex("projectId_seq", ["projectId", "seq"]);
      }
      if (!db.objectStoreNames.contains(STORE_REDO)) {
        const redo = db.createObjectStore(STORE_REDO, { keyPath: "id", autoIncrement: true });
        redo.createIndex("projectId", "projectId");
        redo.createIndex("projectId_seq", ["projectId", "seq"]);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IDB open failed"));
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const store = transaction.objectStore(STORE);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("IDB op failed"));
      }),
  );
}

interface ProjectRecord {
  id: string;
  name: string;
  savedAt: string;
  trackCount: number;
  approxBytes: number;
  file: ProjectFile;
}

export async function saveProject(
  id: string,
  name: string,
  file: ProjectFile,
): Promise<void> {
  const trackCount = file.tracks.length;
  const approxBytes = file.tracks.reduce(
    (acc, t) => acc + (t.audioBlob?.size ?? 0),
    0,
  );
  const record: ProjectRecord = {
    id,
    name,
    savedAt: file.savedAt,
    trackCount,
    approxBytes,
    file,
  };
  await tx("readwrite", (s) => s.put(record));
}

export async function loadProject(id: string): Promise<ProjectFile | null> {
  const record = (await tx("readonly", (s) => s.get(id))) as ProjectRecord | undefined;
  if (record?.file) return record.file;
  return loadRemoteProject(id);
}

export async function deleteProject(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}

export async function listProjects(): Promise<StoredProject[]> {
  const all = (await tx("readonly", (s) => s.getAll())) as ProjectRecord[];
  const local = all
    .map(({ id, name, savedAt, trackCount, approxBytes }) => ({
      id,
      name,
      savedAt,
      trackCount,
      approxBytes,
      source: "local" as const,
    }))
    .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
  const remote = await fetchRemoteProjects();
  const seen = new Set(local.map((project) => project.id));
  const cloud = remote
    .filter((project) => !seen.has(project.id))
    .map((project) => ({
      id: project.id,
      name: project.name,
      savedAt: project.updatedAt,
      trackCount: project.trackCount,
      approxBytes: 0,
      source: "cloud" as const,
    }));
  return [...local, ...cloud].sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}

/** Local-only ID generation. Project IDs never leave the browser, so
 *  collision worries are zero — Date.now() + random suffix is enough. */
export function newProjectId(): string {
  return `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─────────────────────────────────────────────────────────────────────
// Remote sync (#1 — Server-side project sync)
// The IDB store remains the canonical "in-progress" copy because uploads
// are slow on weak networks; remote sync runs as a best-effort write-
// through after a successful local save. Reading is local-first too —
// only fall back to remote when IDB has nothing (or the user signs in
// on a fresh device).
// ─────────────────────────────────────────────────────────────────────

import { uploadStudioAudio } from "@/lib/blobClient";

export interface RemoteStoredProject {
  id: string;
  name: string;
  bpm: number;
  trackCount: number;
  thumbnailPeaks: number[] | null;
  isPublic: boolean;
  coverArtUrl: string | null;
  masterBlobUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

type RemoteTrack = {
  id: string;
  name: string;
  color: string;
  kind?: string | null;
  gainDb?: number | null;
  pan?: number | null;
  muted?: boolean | null;
  solo?: boolean | null;
  armed?: boolean | null;
  blobUrl?: string | null;
  durationSec: number;
  position: number;
};

const DEFAULT_TRACK_FX = {
  eqLowDb: 0,
  eqMidDb: 0,
  eqHighDb: 0,
  compEnabled: true,
  compThreshDb: -18,
  compRatio: 3,
  compParallelBlend: 0,
  vocalBusEnabled: false,
  vocalBusDriveDb: 0,
  vocalBusPresenceDb: 0,
  vocalBusAirDb: 0,
  vocalBusCrush: 0,
  vocalBusDeEssDb: 0,
  reverbWet: 0,
  reverbDecaySec: 2.5,
  delayWet: 0,
  delayBeats: 0.5,
  delayFeedback: 0.35,
};

function emptyLaneSamples() {
  return DRUM_LANES.reduce((acc, lane) => {
    acc[lane] = null;
    return acc;
  }, {} as Record<DrumKind, { name: string; audioBlob: Blob } | null>);
}

async function buildWaveformPeaks(blob: Blob, peakCount = 512): Promise<{ peaks: number[]; durationSec: number; sampleRate?: number }> {
  if (typeof window === "undefined") return { peaks: [], durationSec: 0 };
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return { peaks: [], durationSec: 0 };
  const ctx = new Ctor({ latencyHint: "interactive" });
  try {
    const audio = await ctx.decodeAudioData((await blob.arrayBuffer()).slice(0));
    const blockSize = Math.max(1, Math.floor(audio.length / peakCount));
    const channels = Array.from({ length: audio.numberOfChannels }, (_, channel) => audio.getChannelData(channel));
    const peaks = Array.from({ length: peakCount }, (_, index) => {
      const start = index * blockSize;
      const end = Math.min(audio.length, start + blockSize);
      let max = 0;
      for (let frame = start; frame < end; frame += 1) {
        let sample = 0;
        for (const channel of channels) sample += Math.abs(channel[frame] ?? 0);
        max = Math.max(max, sample / Math.max(1, channels.length));
      }
      return Number(Math.min(1, max).toFixed(5));
    });
    return { peaks, durationSec: audio.duration, sampleRate: audio.sampleRate };
  } catch {
    return { peaks: [], durationSec: 0 };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

async function loadRemoteProject(id: string): Promise<ProjectFile | null> {
  try {
    const res = await fetch(`/api/studio/projects/${encodeURIComponent(id)}`, { credentials: "include" });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      project?: {
        id: string;
        name: string;
        bpm: number;
        tracks?: RemoteTrack[];
        patternJson?: {
          transport?: Partial<ProjectFile["transport"]>;
          beat?: Partial<ProjectFile["beat"]>;
          midi?: Partial<ProjectFile["midi"]>;
          aux?: Partial<ProjectFile["aux"]>;
        } | null;
        updatedAt?: string;
      };
      tracks?: RemoteTrack[];
    };
    const project = data.project;
    if (!project) return null;
    const patternJson = project.patternJson ?? {};
    const remoteTracks = data.tracks ?? project.tracks ?? [];
    const tracks = await Promise.all(remoteTracks.map(async (track) => {
      let audioBlob: Blob | null = null;
      if (track.blobUrl) {
        try {
          const audioRes = await fetch(track.blobUrl, { cache: "force-cache" });
          if (audioRes.ok) audioBlob = await audioRes.blob();
        } catch {
          audioBlob = null;
        }
      }
      return {
        id: track.id,
        name: track.name,
        color: track.color,
        gainDb: track.gainDb ?? 0,
        pan: track.pan ?? 0,
        muted: Boolean(track.muted),
        solo: Boolean(track.solo),
        armed: Boolean(track.armed),
        fx: DEFAULT_TRACK_FX,
        vcaGroupId: null,
        automation: { gainDb: [], pan: [] },
        durationSec: track.durationSec ?? 0,
        audioBlob,
      };
    }));
    return {
      version: 1,
      savedAt: project.updatedAt ?? new Date().toISOString(),
      transport: {
        bpm: patternJson.transport?.bpm ?? project.bpm ?? 120,
        masterDb: patternJson.transport?.masterDb ?? 0,
        masterLimiterOn: patternJson.transport?.masterLimiterOn ?? true,
        loopEnabled: patternJson.transport?.loopEnabled ?? false,
        loopStartSec: patternJson.transport?.loopStartSec ?? 0,
        loopEndSec: patternJson.transport?.loopEndSec ?? 8,
        inputMonitorMode: patternJson.transport?.inputMonitorMode ?? "low-latency",
        countInEnabled: patternJson.transport?.countInEnabled ?? true,
        countInBars: patternJson.transport?.countInBars ?? 1,
        preRollSec: patternJson.transport?.preRollSec ?? 1.5,
        loopRecordEnabled: patternJson.transport?.loopRecordEnabled ?? false,
        maxLoopTakes: patternJson.transport?.maxLoopTakes ?? 6,
        soloMode: patternJson.transport?.soloMode ?? "sip",
        vcaGroups: patternJson.transport?.vcaGroups ?? [],
        referenceMatchDb: patternJson.transport?.referenceMatchDb ?? 0,
      },
      beat: {
        enabled: patternJson.beat?.enabled ?? false,
        pattern: patternJson.beat?.pattern ?? emptyPattern(),
        kit: (patternJson.beat?.kit ?? "trap") as DrumKitId,
        laneSamples: emptyLaneSamples(),
        laneEqSettings: patternJson.beat?.laneEqSettings,
      },
      midi: {
        wave: patternJson.midi?.wave ?? "sawtooth",
        attackSec: patternJson.midi?.attackSec ?? 0.01,
        releaseSec: patternJson.midi?.releaseSec ?? 0.25,
        filterHz: patternJson.midi?.filterHz ?? 1600,
      },
      aux: {
        reverbReturn: patternJson.aux?.reverbReturn ?? { enabled: true, level: 0.18, decaySec: 2.5, parallelMix: 0 },
        delayReturn: patternJson.aux?.delayReturn ?? { enabled: true, level: 0.12, beats: 0.5, feedback: 0.32, parallelMix: 0 },
      },
      tracks,
    };
  } catch {
    return null;
  }
}

/** Write the local project to the server. Audio blobs are uploaded to
 *  Vercel Blob first; the metadata POST then carries the public URLs.
 *  Best-effort — failures are swallowed so a network blip never blocks
 *  the save flow. The caller has already saved locally before getting
 *  here. */
export async function syncProjectToServer(
  id: string,
  name: string,
  file: ProjectFile,
  thumbnailPeaks: number[] | null = null,
): Promise<{ ok: true; remoteId: string } | { ok: false; reason: string }> {
  try {
    const tracks = await Promise.all(
      file.tracks.map(async (t, i) => {
        let blobUrl: string | null = null;
        let storagePath: string | null = null;
        let peaks: number[] = [];
        let sampleRate: number | null = null;
        if (t.audioBlob) {
          // Pathname carries the project + track for human-readable URLs.
          const pathname = `studio/${id}/${t.id}-${i}.bin`;
          const upload = await uploadStudioAudio(pathname, t.audioBlob);
          blobUrl = upload.url;
          storagePath = upload.path;
          const decoded = await buildWaveformPeaks(t.audioBlob);
          peaks = decoded.peaks;
          sampleRate = decoded.sampleRate ?? null;
        }
        return {
          id: t.id,
          name: t.name,
          color: t.color,
          kind: "audio",
          gainDb: t.gainDb,
          pan: t.pan,
          muted: t.muted,
          solo: t.solo,
          armed: t.armed,
          blobUrl,
          storagePath,
          mimeType: t.audioBlob?.type || "audio/wav",
          sizeBytes: t.audioBlob?.size ?? 0,
          peaks,
          sampleRate,
          durationSec: t.durationSec,
          position: i,
        };
      }),
    );

    const res = await fetch("/api/studio/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        name,
        bpm: Math.round(file.transport.bpm),
        // Pattern + transport state lives under a single JSON blob — simple
        // to evolve when the engine's snapshot shape changes.
        patternJson: { transport: file.transport, beat: (file as unknown as { beat?: unknown }).beat ?? null },
        thumbnailPeaks: thumbnailPeaks ?? undefined,
        tracks,
      }),
    });
    if (!res.ok) {
      return { ok: false, reason: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as { project?: { id: string } };
    return { ok: true, remoteId: data.project?.id ?? id };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "unknown",
    };
  }
}

/** Fetch the user's projects from the server. Used by the hub's
 *  "Recent sessions" rail when IndexedDB has none (e.g. fresh device,
 *  cleared storage). Local IDB still wins when both have content. */
export async function fetchRemoteProjects(): Promise<RemoteStoredProject[]> {
  try {
    const res = await fetch("/api/studio/projects", { credentials: "include" });
    if (!res.ok) return [];
    const data = (await res.json()) as { projects?: RemoteStoredProject[] };
    return data.projects ?? [];
  } catch {
    return [];
  }
}

/** Mark a project public/private — drives the share-link flow (#9). */
export async function setProjectPublic(id: string, isPublic: boolean): Promise<boolean> {
  try {
    const res = await fetch(`/api/studio/projects/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublic }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
