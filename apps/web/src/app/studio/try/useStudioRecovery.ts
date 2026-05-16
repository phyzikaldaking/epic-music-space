"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StudioAudioBufferRef, StudioClip, StudioSoundAsset } from "./studioWorkstationTypes";

type StudioSnapshotInput = {
  mode: string;
  selectedTrack: string;
  selectedClipId?: string | null;
  bpm: number;
  bar: number;
  playing: boolean;
  tracks: unknown[];
  clips?: StudioClip[];
  placedClips?: StudioClip[];
  audioBuffers?: StudioAudioBufferRef[];
  soundLibrary?: StudioSoundAsset[];
  padAssignments?: Record<string, unknown>;
  workspaceLayout?: unknown;
  selectedKit?: string | null;
  selectedInstrument?: string | null;
};

type StudioSnapshot = {
  sessionId: string;
  payload?: Partial<StudioSnapshotInput> & { savedAt?: string };
  version?: number;
  updatedAt?: string;
  backend?: string;
};

type RecoveryStatus = "idle" | "checking" | "saved" | "recoverable" | "restored" | "error";

const SESSION_ID_KEY = "ems-studio-session-id";
const PLACED_CLIPS_STORAGE_KEY = "ems-studio-placed-sound-clips";
const SOUNDS_STORAGE_KEY = "ems-studio-sounds";
const PAD_ASSIGNMENTS_STORAGE_KEY = "ems-studio-pad-assignments";
const KIT_STORAGE_KEY = "ems-studio-selected-kit";
const INSTRUMENT_STORAGE_KEY = "ems-studio-selected-instrument";

function getSessionId() {
  if (typeof window === "undefined") return "ems-main-session";
  const existing = window.localStorage.getItem(SESSION_ID_KEY);
  if (existing) return existing;
  const created = `ems-${Date.now()}-${crypto.randomUUID()}`;
  window.localStorage.setItem(SESSION_ID_KEY, created);
  return created;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function readLocalSessionAddons() {
  if (typeof window === "undefined") {
    return {
      placedClips: [] as StudioClip[],
      soundLibrary: [] as StudioSoundAsset[],
      padAssignments: {} as Record<string, unknown>,
      selectedKit: null as string | null,
      selectedInstrument: null as string | null,
    };
  }
  return {
    placedClips: readJson<StudioClip[]>(PLACED_CLIPS_STORAGE_KEY, []),
    soundLibrary: readJson<StudioSoundAsset[]>(SOUNDS_STORAGE_KEY, []),
    padAssignments: readJson<Record<string, unknown>>(PAD_ASSIGNMENTS_STORAGE_KEY, {}),
    selectedKit: window.localStorage.getItem(KIT_STORAGE_KEY),
    selectedInstrument: window.localStorage.getItem(INSTRUMENT_STORAGE_KEY),
  };
}

function localSessionHasWork() {
  const local = readLocalSessionAddons();
  return local.placedClips.length > 0 || local.soundLibrary.length > 0 || Object.keys(local.padAssignments).length > 0;
}

function restoreLocalSessionAddons(payload: Partial<StudioSnapshotInput>) {
  if (typeof window === "undefined") return;
  if (Array.isArray(payload.placedClips)) writeJson(PLACED_CLIPS_STORAGE_KEY, payload.placedClips);
  if (Array.isArray(payload.soundLibrary)) writeJson(SOUNDS_STORAGE_KEY, payload.soundLibrary);
  if (payload.padAssignments && typeof payload.padAssignments === "object") writeJson(PAD_ASSIGNMENTS_STORAGE_KEY, payload.padAssignments);
  if (typeof payload.selectedKit === "string") window.localStorage.setItem(KIT_STORAGE_KEY, payload.selectedKit);
  if (typeof payload.selectedInstrument === "string") window.localStorage.setItem(INSTRUMENT_STORAGE_KEY, payload.selectedInstrument);
  window.dispatchEvent(new CustomEvent("ems:studio-cloud-restored", { detail: payload }));
}

export function useStudioRecovery(snapshot: StudioSnapshotInput, restore: (payload: Partial<StudioSnapshotInput>) => void) {
  const sessionId = useMemo(getSessionId, []);
  const [status, setStatus] = useState<RecoveryStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [recoverable, setRecoverable] = useState<StudioSnapshot | null>(null);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;

  const save = useCallback(async () => {
    try {
      setStatus("checking");
      const localAddons = readLocalSessionAddons();
      const fullSnapshot: StudioSnapshotInput = {
        ...snapshot,
        placedClips: snapshot.placedClips ?? localAddons.placedClips,
        soundLibrary: snapshot.soundLibrary ?? localAddons.soundLibrary,
        padAssignments: snapshot.padAssignments ?? localAddons.padAssignments,
        selectedKit: snapshot.selectedKit ?? localAddons.selectedKit,
        selectedInstrument: snapshot.selectedInstrument ?? localAddons.selectedInstrument,
      };
      const res = await fetch("/api/studio/session/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          roomId: "ems-main-room",
          ...fullSnapshot,
          playing: false,
          metadata: {
            source: "studio-workstation-manual-or-autosave",
            clipCount: fullSnapshot.clips?.length ?? 0,
            placedClipCount: fullSnapshot.placedClips?.length ?? 0,
            soundCount: fullSnapshot.soundLibrary?.length ?? 0,
            padAssignmentCount: Object.keys(fullSnapshot.padAssignments ?? {}).length,
            bufferCount: fullSnapshot.audioBuffers?.length ?? 0,
          },
        }),
      });
      if (!res.ok) throw new Error(`Autosave failed ${res.status}`);
      const data = await res.json();
      const savedAt = data?.snapshot?.updatedAt ?? new Date().toISOString();
      setRecoverable(data?.snapshot ?? null);
      setLastSavedAt(savedAt);
      setStatus("saved");
      window.dispatchEvent(new CustomEvent("ems:studio-toast", { detail: { message: data?.backend === "database" ? "Studio saved to cloud." : "Studio saved locally; cloud unavailable." } }));
    } catch {
      setStatus("error");
      window.dispatchEvent(new CustomEvent("ems:studio-toast", { detail: { message: "Cloud save failed. Local studio state is still preserved." } }));
    }
  }, [sessionId, snapshot]);

  const fetchLatestSnapshot = useCallback(async () => {
    const res = await fetch(`/api/studio/session/snapshot?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Snapshot fetch failed ${res.status}`);
    const data = await res.json();
    const snapshotFromCloud = data?.snapshot as StudioSnapshot | null;
    if (snapshotFromCloud?.payload) {
      setRecoverable({ ...snapshotFromCloud, backend: data?.backend });
      setLastSavedAt(snapshotFromCloud.updatedAt ?? null);
      setStatus("recoverable");
      return snapshotFromCloud;
    }
    setRecoverable(null);
    setStatus("idle");
    return null;
  }, [sessionId]);

  useEffect(() => {
    let active = true;
    async function check() {
      try {
        setStatus("checking");
        const latest = await fetchLatestSnapshot();
        if (!active) return;
        if (!latest?.payload) setStatus("idle");
      } catch {
        if (active) setStatus("error");
      }
    }
    void check();
    return () => { active = false; };
  }, [fetchLatestSnapshot]);

  useEffect(() => {
    const id = window.setInterval(() => { void save(); }, 15000);
    return () => window.clearInterval(id);
  }, [save]);

  const restoreSnapshot = useCallback(async () => {
    try {
      setStatus("checking");
      const latest = await fetchLatestSnapshot();
      if (!latest?.payload) {
        window.dispatchEvent(new CustomEvent("ems:studio-toast", { detail: { message: "No cloud session snapshot found yet." } }));
        setStatus("idle");
        return;
      }
      const hasLocalWork = localSessionHasWork();
      const shouldRestore = !hasLocalWork || window.confirm("Restore from cloud? This will replace the current local sounds, custom pads, and placed timeline clips with the latest cloud snapshot.");
      if (!shouldRestore) {
        setStatus("recoverable");
        return;
      }
      restoreLocalSessionAddons(latest.payload);
      restoreRef.current(latest.payload);
      setStatus("restored");
      window.dispatchEvent(new CustomEvent("ems:studio-toast", { detail: { message: "Studio restored from cloud." } }));
    } catch {
      setStatus("error");
      window.dispatchEvent(new CustomEvent("ems:studio-toast", { detail: { message: "Cloud restore failed. Local studio state was not changed." } }));
    }
  }, [fetchLatestSnapshot]);

  return { sessionId, status, lastSavedAt, recoverable, save, restoreSnapshot };
}
