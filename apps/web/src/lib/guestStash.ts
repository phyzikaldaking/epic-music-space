/**
 * Guest stash — IndexedDB-backed blob handoff for the guest-publish flow.
 *
 * The story: a guest visitor cuts a track in /studio/try, hits "Publish,"
 * we stash the rendered WAV here (IndexedDB because localStorage can't
 * reliably hold multi-MB blobs), bounce them through signup, and on the
 * other side /studio/new pulls the blob back out and finishes the upload
 * against their now-authenticated session. This is the difference between
 * "they tried it" and "they signed up" — we capture the artifact at the
 * exact moment they care about it most.
 *
 * The DB has one object store keyed by a stable name. Only one blob lives
 * there at a time; calling stashMix overwrites the previous entry. We
 * also stamp `createdAt` so a stale stash >24h old gets purged on read.
 */

const DB_NAME = "ems-guest-stash";
const DB_VERSION = 1;
const STORE = "mixes";
const ENTRY_KEY = "current";
const TTL_MS = 24 * 60 * 60 * 1000;

export interface GuestMixEntry {
  blob: Blob;
  fileName: string;
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
  });
}

export async function stashGuestMix(blob: Blob, fileName: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(
      { blob, fileName, createdAt: Date.now() } satisfies GuestMixEntry,
      ENTRY_KEY,
    );
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("stash put failed"));
  });
  db.close();
}

export async function readGuestMix(): Promise<GuestMixEntry | null> {
  let db: IDBDatabase;
  try { db = await openDb(); } catch { return null; }
  try {
    const entry = await new Promise<GuestMixEntry | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(ENTRY_KEY);
      req.onsuccess = () => resolve((req.result as GuestMixEntry | undefined) ?? null);
      req.onerror = () => reject(req.error ?? new Error("stash read failed"));
    });
    if (!entry) return null;
    if (Date.now() - entry.createdAt > TTL_MS) {
      void clearGuestMix();
      return null;
    }
    return entry;
  } finally {
    db.close();
  }
}

export async function clearGuestMix(): Promise<void> {
  let db: IDBDatabase;
  try { db = await openDb(); } catch { return; }
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(ENTRY_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}

/** Sentinel used in URL params + localStorage so /studio/new knows
 *  to look in the stash. localStorage flag is the durable signal across
 *  the OAuth round-trip, since the URL params get rewritten by NextAuth. */
export const GUEST_RESUME_FLAG = "ems-guest-publish-resume";
