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

const DB_NAME = "ems-daw";
// Bumped to 2 when the undoSnapshots store was added (see undoStorage.ts).
// Both files run upgrades against the same shared DB; whichever opens
// first triggers the upgrade for any missing stores.
const DB_VERSION = 2;
const STORE = "projects";
const STORE_UNDO = "undoSnapshots";

export interface StoredProject {
  id: string;
  name: string;
  savedAt: string;
  trackCount: number;
  /** Approximate stored size in bytes — sum of audio blob sizes. */
  approxBytes: number;
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
  return record?.file ?? null;
}

export async function deleteProject(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}

export async function listProjects(): Promise<StoredProject[]> {
  const all = (await tx("readonly", (s) => s.getAll())) as ProjectRecord[];
  return all
    .map(({ id, name, savedAt, trackCount, approxBytes }) => ({
      id,
      name,
      savedAt,
      trackCount,
      approxBytes,
    }))
    .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
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
        if (t.audioBlob) {
          // Pathname carries the project + track for human-readable URLs.
          const pathname = `studio/${id}/${t.id}-${i}.bin`;
          const upload = await uploadStudioAudio(pathname, t.audioBlob);
          blobUrl = upload.url;
        }
        return {
          id: t.id,
          name: t.name,
          color: t.color,
          blobUrl,
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
