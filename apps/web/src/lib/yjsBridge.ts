"use client";

import * as Y from "yjs";
import { createBrowserSupabaseClient } from "@/lib/supabase";

/** Minimal Yjs provider that broadcasts updates over a Supabase realtime
 *  channel. Used for project-level CRDT collab (#10).
 *
 *  Wire format: each message is a base64-encoded `Y.encodeStateAsUpdate`
 *  payload. On connect, peers exchange a "sync request" that returns the
 *  full state vector so a late joiner catches up. */

export interface YjsCollabHandle {
  /** Yjs document. Subscribe to its top-level Maps to react to remote
   *  edits. */
  doc: Y.Doc;
  /** Tear down channel + listeners. Always called on unmount. */
  destroy: () => void;
}

interface ProjectShared {
  bpm: number | null;
  beatKit: string | null;
  beatEnabled: boolean | null;
  /** Beat machine pattern as a flat record of `${lane}:${step}` → boolean.
   *  Yjs maps don't carry custom prototypes, so we use a string key for
   *  every cell rather than a nested map. */
  beatSteps: Record<string, boolean>;
}

export function startYjsCollab(projectId: string): YjsCollabHandle {
  const doc = new Y.Doc();
  const supabase = createBrowserSupabaseClient();

  // Supabase isn't configured in some envs (e.g. CI). Return a doc-only
  // handle so callers can still observe local edits without crashing.
  if (!supabase) {
    return {
      doc,
      destroy: () => {
        doc.destroy();
      },
    };
  }

  // Channel + suppressLocal are bound lazily, only after authorization
  // succeeds (#12). Until then any local updates queue up locally without
  // broadcasting. Caller can keep editing — they just won't sync to peers
  // until the server confirms ownership.
  type Channel = ReturnType<typeof supabase.channel>;
  let channel: Channel | null = null;
  let cancelled = false;
  let suppressLocal = false;
  const pendingLocalUpdates: Uint8Array[] = [];

  function onRemoteUpdate(payload: { update: string }) {
    try {
      const bytes = base64ToBytes(payload.update);
      if (bytes.length === 0) return;
      suppressLocal = true;
      Y.applyUpdate(doc, bytes);
      suppressLocal = false;
    } catch {
      suppressLocal = false;
    }
  }

  function onSyncRequest() {
    if (!channel) return;
    const update = Y.encodeStateAsUpdate(doc);
    void channel.send({
      type: "broadcast",
      event: "y-update",
      payload: { update: bytesToBase64(update) },
    });
  }

  // Local writes are buffered until the channel is open. Once auth
  // passes, we drain the buffer in order so peers see every edit.
  doc.on("update", (update: Uint8Array, _origin: unknown) => {
    if (suppressLocal) return;
    if (!channel) {
      pendingLocalUpdates.push(update);
      return;
    }
    void channel.send({
      type: "broadcast",
      event: "y-update",
      payload: { update: bytesToBase64(update) },
    });
  });

  // Authorization gate: ask the server whether this user is allowed on
  // this project's channel. Network/auth failures fall back to local-only
  // mode so the user keeps working — they just won't sync.
  void (async () => {
    try {
      const res = await fetch(
        `/api/studio/projects/${encodeURIComponent(projectId)}/collab-token`,
        { credentials: "include" },
      );
      if (!res.ok) return;
      const data = (await res.json()) as { channel?: string; ok?: boolean };
      if (!data.ok || !data.channel || cancelled) return;

      channel = supabase.channel(data.channel, {
        config: { broadcast: { self: false } },
      });

      channel.on("broadcast", { event: "y-update" }, ({ payload }) => {
        onRemoteUpdate(payload as { update: string });
      });
      channel.on("broadcast", { event: "y-sync-request" }, () => {
        onSyncRequest();
      });

      void channel.subscribe((status: string) => {
        if (status !== "SUBSCRIBED" || !channel) return;
        // Ask peers for the latest state.
        void channel.send({
          type: "broadcast",
          event: "y-sync-request",
          payload: { from: doc.clientID },
        });
        // Drain any local edits that happened while we were waiting.
        while (pendingLocalUpdates.length > 0) {
          const update = pendingLocalUpdates.shift()!;
          void channel.send({
            type: "broadcast",
            event: "y-update",
            payload: { update: bytesToBase64(update) },
          });
        }
      });
    } catch {
      // Network blip — stay in local-only mode.
    }
  })();

  return {
    doc,
    destroy: () => {
      cancelled = true;
      try {
        if (channel) void channel.unsubscribe();
      } catch {
        // ignore
      }
      doc.destroy();
    },
  };
}

/** Helpers to read/write the shared parameter state. Caller binds these
 *  to engine snapshots / setters via observation in DawWorkspace. */

export function getSharedProject(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap("project");
}

export function setSharedField<K extends keyof ProjectShared>(
  doc: Y.Doc,
  key: K,
  value: ProjectShared[K],
): void {
  const map = getSharedProject(doc);
  doc.transact(() => {
    map.set(key, value as unknown);
  });
}

/** Get (or lazily create) the nested Y.Map that holds individual beat
 *  steps keyed by `${lane}:${step}`. Using a Y.Map for the steps means
 *  toggling one cell broadcasts a single-key delta instead of the whole
 *  pattern (#13). Calls share doc.transact so the create + initial
 *  population are one atomic update. */
function getSharedBeatSteps(doc: Y.Doc): Y.Map<boolean> {
  const map = getSharedProject(doc);
  let stepsMap = map.get("beatSteps") as Y.Map<boolean> | undefined;
  if (!(stepsMap instanceof Y.Map)) {
    stepsMap = new Y.Map<boolean>();
    map.set("beatSteps", stepsMap);
  }
  return stepsMap;
}

export function readSharedFields(doc: Y.Doc): Partial<ProjectShared> {
  const map = getSharedProject(doc);
  const stepsMap = map.get("beatSteps");
  const stepsRecord: Record<string, boolean> = {};
  if (stepsMap instanceof Y.Map) {
    stepsMap.forEach((value, key) => {
      stepsRecord[key] = Boolean(value);
    });
  }
  return {
    bpm: (map.get("bpm") as number | null | undefined) ?? null,
    beatKit: (map.get("beatKit") as string | null | undefined) ?? null,
    beatEnabled:
      (map.get("beatEnabled") as boolean | null | undefined) ?? null,
    beatSteps: stepsRecord,
  };
}

export function setSharedBeatStep(
  doc: Y.Doc,
  lane: string,
  step: number,
  on: boolean,
): void {
  doc.transact(() => {
    const stepsMap = getSharedBeatSteps(doc);
    stepsMap.set(`${lane}:${step}`, on);
  });
}

/** Subscribe to changes inside the beatSteps map. Returns the unobserve
 *  function. Used by DawWorkspace so remote toggles can apply without
 *  re-walking the whole map. The observer fires once per Y.Map.set. */
export function observeBeatSteps(
  doc: Y.Doc,
  listener: (changes: Array<{ key: string; on: boolean }>) => void,
): () => void {
  const stepsMap = getSharedBeatSteps(doc);
  const handler = (event: Y.YMapEvent<boolean>) => {
    const changes: Array<{ key: string; on: boolean }> = [];
    event.changes.keys.forEach((change, key) => {
      if (change.action === "delete") {
        changes.push({ key, on: false });
      } else {
        changes.push({ key, on: Boolean(stepsMap.get(key)) });
      }
    });
    if (changes.length > 0) listener(changes);
  };
  stepsMap.observe(handler);
  return () => stepsMap.unobserve(handler);
}

// Browser-safe base64 helpers. `btoa(String.fromCharCode(...bytes))` blows
// the call stack at ~64K args, and `binary += String.fromCharCode(b)` in a
// loop quadratically allocates as the string grows. We chunk the bytes
// (8 KB chunks survive every browser engine's argument-list limit) and
// concatenate the resulting base64 strings, which is fast and stable for
// CRDT updates well into the hundreds of KB.
const B64_CHUNK = 0x8000;

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === "function") {
    let binary = "";
    for (let i = 0; i < bytes.length; i += B64_CHUNK) {
      const slice = bytes.subarray(i, Math.min(i + B64_CHUNK, bytes.length));
      binary += String.fromCharCode.apply(null, slice as unknown as number[]);
    }
    return btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(b64: string): Uint8Array {
  // Bad payloads (truncated stream, tampered broadcast, replay attack)
  // must never crash the doc — we treat decode errors as a no-op update.
  // #19: defensive try/catch.
  try {
    if (typeof atob === "function") {
      const binary = atob(b64);
      const out = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
      return out;
    }
    return new Uint8Array(Buffer.from(b64, "base64"));
  } catch {
    return new Uint8Array(0);
  }
}
