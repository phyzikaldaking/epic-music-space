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
const DB_VERSION = 1;
const STORE = "projects";

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
