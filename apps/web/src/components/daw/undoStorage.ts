/**
 * Reload-survivable undo stack for the EMS studio.
 *
 * Strategy:
 *   • Each meaningful state change pushes a SNAPSHOT (the full ProjectFile)
 *     into a per-project ring buffer in IndexedDB.
 *   • Undo restores the previous snapshot by hydrating the engine from it.
 *   • The stack survives reloads because it's in IDB, not memory.
 *
 * Why snapshots, not operation logs:
 *   The engine has ~50 setters mutating audio nodes, automation, beat
 *   patterns, FX, and so on. Building inverse-op tracking for all of
 *   them is a multi-week refactor with high risk of subtle bugs. A
 *   serialize/hydrate snapshot is coarse-grained but lossless for
 *   everything the user can actually edit, and we already have both
 *   sides of the wire (serializeProject + hydrateProject) battle-tested
 *   from the project save/load flow.
 *
 * Cost is bounded: each snapshot only contains audio blobs by reference
 * (IDB stores Blob natively). The cap on stack depth is configurable
 * (default 30). Old snapshots are evicted FIFO.
 */

import type { ProjectFile } from "./dawEngine";

const DB_NAME = "ems-daw";
const DB_VERSION = 3;
const STORE_PROJECTS = "projects";
const STORE_UNDO = "undoSnapshots";
const STORE_REDO = "redoSnapshots";
const MAX_SNAPSHOTS_PER_PROJECT = 30;

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
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        const store = db.createObjectStore(STORE_PROJECTS, { keyPath: "id" });
        store.createIndex("savedAt", "savedAt");
      }
      if (!db.objectStoreNames.contains(STORE_UNDO)) {
        const store = db.createObjectStore(STORE_UNDO, { keyPath: "id", autoIncrement: true });
        store.createIndex("projectId", "projectId");
        store.createIndex("projectId_seq", ["projectId", "seq"]);
      }
      if (!db.objectStoreNames.contains(STORE_REDO)) {
        const store = db.createObjectStore(STORE_REDO, { keyPath: "id", autoIncrement: true });
        store.createIndex("projectId", "projectId");
        store.createIndex("projectId_seq", ["projectId", "seq"]);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IDB open failed"));
  });
  return dbPromise;
}

interface UndoRecord {
  id?: number;
  projectId: string;
  seq: number;
  capturedAt: string;
  label: string;
  file: ProjectFile;
}

function txAsync<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE_UNDO, mode);
        const store = transaction.objectStore(STORE_UNDO);
        Promise.resolve(fn(store))
          .then(resolve)
          .catch(reject);
        transaction.onerror = () => reject(transaction.error ?? new Error("IDB tx failed"));
      }),
  );
}

function txStoresAsync<T>(
  mode: IDBTransactionMode,
  fn: (stores: { undo: IDBObjectStore; redo: IDBObjectStore }) => Promise<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction([STORE_UNDO, STORE_REDO], mode);
        const stores = {
          undo: transaction.objectStore(STORE_UNDO),
          redo: transaction.objectStore(STORE_REDO),
        };
        Promise.resolve(fn(stores))
          .then(resolve)
          .catch(reject);
        transaction.onerror = () => reject(transaction.error ?? new Error("IDB tx failed"));
      }),
  );
}

function reqPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IDB op failed"));
  });
}

/** Push a new snapshot onto the undo stack for this project. Evicts the
 *  oldest if we're past the cap. */
export async function pushUndoSnapshot(
  projectId: string,
  file: ProjectFile,
  label: string,
): Promise<void> {
  await txStoresAsync("readwrite", async ({ undo, redo }) => {
    // Get current stack to compute next seq + evict.
    const idx = undo.index("projectId");
    const all = (await reqPromise(idx.getAll(projectId))) as UndoRecord[];
    all.sort((a, b) => a.seq - b.seq);
    const nextSeq = (all[all.length - 1]?.seq ?? -1) + 1;
    await reqPromise(
      undo.add({
        projectId,
        seq: nextSeq,
        capturedAt: new Date().toISOString(),
        label,
        file,
      }),
    );
    if (all.length + 1 > MAX_SNAPSHOTS_PER_PROJECT) {
      const overage = all.length + 1 - MAX_SNAPSHOTS_PER_PROJECT;
      for (let i = 0; i < overage; i++) {
        const victim = all[i];
        if (victim?.id !== undefined) {
          await reqPromise(undo.delete(victim.id));
        }
      }
    }
    const redoIdx = redo.index("projectId");
    const redoRecords = (await reqPromise(redoIdx.getAll(projectId))) as UndoRecord[];
    for (const record of redoRecords) {
      if (record.id !== undefined) await reqPromise(redo.delete(record.id));
    }
  });
}

export interface UndoSnapshotInfo {
  id: number;
  seq: number;
  capturedAt: string;
  label: string;
}

/** List metadata about all snapshots (no file payloads, so cheap to call). */
export async function listUndoSnapshots(projectId: string): Promise<UndoSnapshotInfo[]> {
  return txAsync("readonly", async (store) => {
    const idx = store.index("projectId");
    const all = (await reqPromise(idx.getAll(projectId))) as UndoRecord[];
    return all
      .filter((r) => r.id !== undefined)
      .sort((a, b) => a.seq - b.seq)
      .map(({ id, seq, capturedAt, label }) => ({
        id: id as number,
        seq,
        capturedAt,
        label,
      }));
  });
}

/** Pop the most recent snapshot — returns the *previous* one (the state
 *  to restore on undo). The popped snapshot is removed from the stack
 *  so a second undo goes one step further back. */
export async function popUndoSnapshot(
  projectId: string,
): Promise<{ file: ProjectFile; label: string } | null> {
  return txStoresAsync("readwrite", async ({ undo, redo }) => {
    const idx = undo.index("projectId");
    const all = (await reqPromise(idx.getAll(projectId))) as UndoRecord[];
    all.sort((a, b) => a.seq - b.seq);
    if (all.length < 2) {
      // Need at least 2 — the latest is the *current* state, so popping
      // means dropping the current and returning the previous.
      return null;
    }
    const current = all[all.length - 1];
    if (current?.id !== undefined) {
      await reqPromise(undo.delete(current.id));
      await reqPromise(redo.add({
        projectId,
        seq: Date.now(),
        capturedAt: new Date().toISOString(),
        label: current.label,
        file: current.file,
      }));
    }
    const previous = all[all.length - 2];
    if (!previous) return null;
    return { file: previous.file, label: previous.label };
  });
}

/** Restore the latest redo snapshot and push it back onto the undo stack. */
export async function popRedoSnapshot(
  projectId: string,
): Promise<{ file: ProjectFile; label: string } | null> {
  return txStoresAsync("readwrite", async ({ undo, redo }) => {
    const redoIdx = redo.index("projectId");
    const redoRecords = (await reqPromise(redoIdx.getAll(projectId))) as UndoRecord[];
    redoRecords.sort((a, b) => a.seq - b.seq);
    const next = redoRecords[redoRecords.length - 1];
    if (!next) return null;
    if (next.id !== undefined) await reqPromise(redo.delete(next.id));

    const undoIdx = undo.index("projectId");
    const undoRecords = (await reqPromise(undoIdx.getAll(projectId))) as UndoRecord[];
    undoRecords.sort((a, b) => a.seq - b.seq);
    const seq = (undoRecords[undoRecords.length - 1]?.seq ?? -1) + 1;
    await reqPromise(undo.add({
      projectId,
      seq,
      capturedAt: new Date().toISOString(),
      label: next.label,
      file: next.file,
    }));
    return { file: next.file, label: next.label };
  });
}

/** Jump to a specific snapshot by id. Returns the file at that id and
 *  trims every snapshot *after* it from the stack, so the next Cmd+Z
 *  would step back one entry from where we landed. Used by the undo
 *  timeline panel for time-travel. */
export async function restoreUndoSnapshotById(
  projectId: string,
  id: number,
): Promise<{ file: ProjectFile; label: string } | null> {
  return txStoresAsync("readwrite", async ({ undo, redo }) => {
    const idx = undo.index("projectId");
    const all = (await reqPromise(idx.getAll(projectId))) as UndoRecord[];
    all.sort((a, b) => a.seq - b.seq);
    const targetIdx = all.findIndex((r) => r.id === id);
    if (targetIdx < 0) return null;
    const target = all[targetIdx];
    if (!target) return null;
    // Delete every snapshot *after* the target — the user is rewinding
    // and any future-history beyond that point is invalidated.
    for (let i = targetIdx + 1; i < all.length; i++) {
      const v = all[i];
      if (v?.id !== undefined) {
        await reqPromise(undo.delete(v.id));
        await reqPromise(redo.add({
          projectId,
          seq: Date.now() + i,
          capturedAt: new Date().toISOString(),
          label: v.label,
          file: v.file,
        }));
      }
    }
    return { file: target.file, label: target.label };
  });
}

/** Drop every snapshot for a project. Used when starting a new session
 *  or explicitly clearing history. */
export async function clearUndoStack(projectId: string): Promise<void> {
  await txStoresAsync("readwrite", async ({ undo, redo }) => {
    const undoRecords = (await reqPromise(undo.index("projectId").getAll(projectId))) as UndoRecord[];
    const redoRecords = (await reqPromise(redo.index("projectId").getAll(projectId))) as UndoRecord[];
    for (const r of [...undoRecords, ...redoRecords]) {
      if (r.id !== undefined) {
        const store = undoRecords.includes(r) ? undo : redo;
        await reqPromise(store.delete(r.id));
      }
    }
  });
}
