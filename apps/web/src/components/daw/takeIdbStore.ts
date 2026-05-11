// IndexedDB persistence for recorded takes. Survives tab crashes,
// hard refreshes, and battery-drop laptop sleeps. The engine writes
// every captured take's PCM here right after stopRecording; on next
// mount the recovery flow can find them and offer "restore" if the
// in-flight breadcrumb was stale.
//
// We store the AudioBuffer as a Float32Array per channel + sample
// rate + duration. Smaller + faster than serializing the buffer
// object itself, and we don't need to depend on structured clone
// quirks across browsers.

const DB_NAME = "ems-studio";
const STORE = "takes";
const VERSION = 1;

interface StoredTake {
  id: string;
  trackId: string;
  trackName: string;
  sampleRate: number;
  channels: Float32Array[];
  durationSec: number;
  recordedAt: string;
  /** Soft cap: rows older than `staleAfterDays` are auto-pruned.
   *  Keeps the IDB from growing without bound on heavy-use sessions. */
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("trackId", "trackId");
        store.createIndex("recordedAt", "recordedAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      // Private browsing / Safari quirks: IDB throws. Recovery is
      // best-effort, so we just resolve null and the rest of the
      // app keeps running.
      resolve(null);
    };
  });
}

/** Persist a take's PCM to IDB. Best-effort — caller doesn't await
 *  this. We don't surface errors to the user; the take's audio still
 *  lives in memory, IDB is purely a survival mechanism. */
export async function persistTake(take: {
  id: string;
  trackId: string;
  trackName: string;
  buffer: AudioBuffer;
  recordedAt: string;
}): Promise<void> {
  try {
    const db = await openDb();
    if (!db) return;
    const channels: Float32Array[] = [];
    for (let ch = 0; ch < take.buffer.numberOfChannels; ch++) {
      const src = take.buffer.getChannelData(ch);
      // Copy into a standalone TypedArray so the source isn't
      // referenced once the buffer GCs.
      const copy = new Float32Array(src.length);
      copy.set(src);
      channels.push(copy);
    }
    const row: StoredTake = {
      id: take.id,
      trackId: take.trackId,
      trackName: take.trackName,
      sampleRate: take.buffer.sampleRate,
      channels,
      durationSec: take.buffer.duration,
      recordedAt: take.recordedAt,
    };
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(row);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve(); // best-effort
      tx.onabort = () => resolve();
    });
    db.close();
  } catch {
    // Silent — best-effort persistence.
  }
}

/** Pull every persisted take, newest first. Used by the recovery
 *  prompt to surface a "restore N takes" option. */
export async function listPersistedTakes(): Promise<
  Array<{
    id: string;
    trackId: string;
    trackName: string;
    durationSec: number;
    recordedAt: string;
  }>
> {
  try {
    const db = await openDb();
    if (!db) return [];
    const rows = await new Promise<StoredTake[]>((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result as StoredTake[]);
      req.onerror = () => resolve([]);
    });
    db.close();
    return rows
      .map((r) => ({
        id: r.id,
        trackId: r.trackId,
        trackName: r.trackName,
        durationSec: r.durationSec,
        recordedAt: r.recordedAt,
      }))
      .sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1));
  } catch {
    return [];
  }
}

/** Rehydrate a persisted take into an AudioBuffer the engine can
 *  attach to a track. Returns null when the take id is missing. */
export async function loadPersistedTake(
  ctx: AudioContext,
  id: string,
): Promise<AudioBuffer | null> {
  try {
    const db = await openDb();
    if (!db) return null;
    const row = await new Promise<StoredTake | undefined>((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result as StoredTake | undefined);
      req.onerror = () => resolve(undefined);
    });
    db.close();
    if (!row) return null;
    const buf = ctx.createBuffer(
      row.channels.length,
      row.channels[0]?.length ?? 0,
      row.sampleRate,
    );
    for (let ch = 0; ch < row.channels.length; ch++) {
      // copyToChannel is typed to accept Float32Array<ArrayBuffer>;
      // our stored channels carry the ArrayBufferLike variant after
      // IDB round-trip. The data is byte-identical — cast through
      // unknown to satisfy the strict TypedArray generic.
      buf.copyToChannel(row.channels[ch] as unknown as Float32Array<ArrayBuffer>, ch);
    }
    return buf;
  } catch {
    return null;
  }
}

/** Drop a take from IDB. Called when the user explicitly deletes it
 *  from the take browser. */
export async function deletePersistedTake(id: string): Promise<void> {
  try {
    const db = await openDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    // ignore
  }
}

/** Prune takes older than `staleAfterDays`. Called once on engine
 *  init so the IDB doesn't grow forever — most producers don't need
 *  weeks of in-flight takes living in their browser. */
export async function pruneStaleTakes(staleAfterDays = 14): Promise<void> {
  try {
    const db = await openDb();
    if (!db) return;
    const cutoff = new Date(Date.now() - staleAfterDays * 86_400_000).toISOString();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      const idx = tx.objectStore(STORE).index("recordedAt");
      const range = IDBKeyRange.upperBound(cutoff, true);
      const req = idx.openCursor(range);
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => resolve();
    });
    db.close();
  } catch {
    // ignore
  }
}
