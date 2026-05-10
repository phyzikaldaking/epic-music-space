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

  const channelName = `ems:studio:project:${projectId}`;

  // We send Y updates encoded as base64 strings since Supabase realtime
  // payloads are JSON. Uint8Array → base64 round-trip.
  const channel = supabase.channel(channelName, {
    config: { broadcast: { self: false } },
  });

  let suppressLocal = false;

  // Apply remote updates; suppressLocal stops the resulting `update`
  // event from re-emitting onto the wire and looping forever.
  function onRemoteUpdate(payload: { update: string }) {
    try {
      const bytes = base64ToBytes(payload.update);
      suppressLocal = true;
      Y.applyUpdate(doc, bytes);
      suppressLocal = false;
    } catch {
      suppressLocal = false;
    }
  }

  function onSyncRequest() {
    // Send full state to whoever asked. Cheap for a small CRDT (the
    // pattern map is at most ~256 entries).
    const update = Y.encodeStateAsUpdate(doc);
    void channel.send({
      type: "broadcast",
      event: "y-update",
      payload: { update: bytesToBase64(update) },
    });
  }

  channel.on("broadcast", { event: "y-update" }, ({ payload }) => {
    onRemoteUpdate(payload as { update: string });
  });
  channel.on("broadcast", { event: "y-sync-request" }, () => {
    onSyncRequest();
  });

  void channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      // Ask peers for the latest state. If no one's there, this is a
      // no-op and we own the canonical doc until someone else joins.
      void channel.send({
        type: "broadcast",
        event: "y-sync-request",
        payload: { from: doc.clientID },
      });
    }
  });

  // Local writes: broadcast updates as they happen.
  doc.on("update", (update: Uint8Array, _origin: unknown) => {
    if (suppressLocal) return;
    void channel.send({
      type: "broadcast",
      event: "y-update",
      payload: { update: bytesToBase64(update) },
    });
  });

  return {
    doc,
    destroy: () => {
      try {
        void channel.unsubscribe();
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

export function readSharedFields(doc: Y.Doc): Partial<ProjectShared> {
  const map = getSharedProject(doc);
  return {
    bpm: (map.get("bpm") as number | null | undefined) ?? null,
    beatKit: (map.get("beatKit") as string | null | undefined) ?? null,
    beatEnabled:
      (map.get("beatEnabled") as boolean | null | undefined) ?? null,
    beatSteps: (map.get("beatSteps") as Record<string, boolean> | undefined) ?? {},
  };
}

export function setSharedBeatStep(
  doc: Y.Doc,
  lane: string,
  step: number,
  on: boolean,
): void {
  const map = getSharedProject(doc);
  doc.transact(() => {
    const existing = (map.get("beatSteps") as Record<string, boolean> | undefined) ?? {};
    const next = { ...existing, [`${lane}:${step}`]: on };
    map.set("beatSteps", next);
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return typeof btoa === "function"
    ? btoa(binary)
    : Buffer.from(binary, "binary").toString("base64");
}

function base64ToBytes(b64: string): Uint8Array {
  const binary =
    typeof atob === "function"
      ? atob(b64)
      : Buffer.from(b64, "base64").toString("binary");
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}
