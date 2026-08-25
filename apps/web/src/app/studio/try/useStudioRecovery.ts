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
  payload?: Partial<StudioSnapshotInput> & { savedAt?: string; autosave?: boolean; localSavedAt?: string };
  version?: number;
  updatedAt?: string;
  backend?: string;
};

type RecoveryStatus = "idle" | "checking" | "saved" | "recoverable" | "restored" | "error";\nconst SNAPSHOT_SCHEMA_VERSION = 3;

const SESSION_ID_KEY = "ems-studio-session-id-v2";
const LOCAL_SNAPSHOT_KEY = "ems-studio-local-recovery-snapshot-v2";
const LOCAL_SNAPSHOT_INDEX_KEY = "ems-studio-local-recovery-index-v2";
const AUTOSAVE_ENABLED_KEY = "ems-studio-autosave-enabled-v2";
const PLACED_CLIPS_STORAGE_KEY = "ems-studio-placed-sound-clips";
const SOUNDS_STORAGE_KEY = "ems-studio-sounds";
const PAD_ASSIGNMENTS_STORAGE_KEY = "ems-studio-pad-assignments";
const KIT_STORAGE_KEY = "ems-studio-selected-kit";
const INSTRUMENT_STORAGE_KEY = "ems-studio-selected-instrument";
const AUTOSAVE_INTERVAL_MS = 10_000;

function getSessionId() {
  if (typeof window === "undefined") return "ems-main-session";
  const existing = window.localStorage.getItem(SESSION_ID_KEY);
  if (existing) return existing;
  const created = `ems-${Date.now()}-${crypto.randomUUID()}`;
  window.localStorage.setItem(SESSION_ID_KEY, created);
  return created;
}

function migrateSnapshot(snapshot: StudioSnapshot): StudioSnapshot {
  const payload = snapshot.payload ?? {};
  const version = snapshot.version ?? 1;
  if (version >= SNAPSHOT_SCHEMA_VERSION) return snapshot;
  return {
    ...snapshot,
    version: SNAPSHOT_SCHEMA_VERSION,
    payload: {
      ...payload,
      zoom: typeof payload.zoom === "number" ? payload.zoom : 1,
      viewportState: payload.viewportState ?? { zoom: typeof payload.zoom === "number" ? payload.zoom : 1 },
      transportState: payload.transportState ?? { bpm: payload.bpm ?? 92, bar: payload.bar ?? 1, playing: false },
      mixerState: payload.mixerState ?? [],
      automation: Array.isArray(payload.automation) ? payload.automation : [],
    },
  };
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

function isAutosaveEnabled() {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(AUTOSAVE_ENABLED_KEY);
  if (stored === null) {
    window.localStorage.setItem(AUTOSAVE_ENABLED_KEY, "true");
    return true;
  }
  return stored !== "false";
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

function mergeFullSnapshot(snapshot: StudioSnapshotInput): StudioSnapshotInput {
  const localAddons = readLocalSessionAddons();
  return {
    ...snapshot,
    playing: false,
    placedClips: snapshot.placedClips ?? localAddons.placedClips,
    soundLibrary: snapshot.soundLibrary ?? localAddons.soundLibrary,
    padAssignments: snapshot.padAssignments ?? localAddons.padAssignments,
    selectedKit: snapshot.selectedKit ?? localAddons.selectedKit,
    selectedInstrument: snapshot.selectedInstrument ?? localAddons.selectedInstrument,
  };
}

function snapshotHasWork(payload?: Partial<StudioSnapshotInput>) {
  if (!payload) return false;
  return Boolean(
    (Array.isArray(payload.tracks) && payload.tracks.length > 0) ||
    (Array.isArray(payload.clips) && payload.clips.length > 0) ||
    (Array.isArray(payload.placedClips) && payload.placedClips.length > 0) ||
    (Array.isArray(payload.soundLibrary) && payload.soundLibrary.length > 0) ||
    (payload.padAssignments && Object.keys(payload.padAssignments).length > 0),
  );
}

function localSessionHasWork() {
  const local = readLocalSessionAddons();
  return local.placedClips.length > 0 || local.soundLibrary.length > 0 || Object.keys(local.padAssignments).length > 0;
}

function readLocalRecoverySnapshot(): StudioSnapshot | null {
  if (typeof window === "undefined") return null;
  const snapshot = readJson<StudioSnapshot | null>(LOCAL_SNAPSHOT_KEY, null);
  return snapshot?.payload && snapshotHasWork(snapshot.payload) ? migrateSnapshot(snapshot) : null;
}

function writeLocalRecoverySnapshot(sessionId: string, snapshot: StudioSnapshotInput) {
  if (typeof window === "undefined") return null;
  const now = new Date().toISOString();
  const payload = {
    ...mergeFullSnapshot(snapshot),
    autosave: true,
    localSavedAt: now,
    savedAt: now,
  };
  const localSnapshot: StudioSnapshot = {
    sessionId,
    payload,
    backend: "local",
    version: SNAPSHOT_SCHEMA_VERSION,
    updatedAt: now,
  };
  writeJson(LOCAL_SNAPSHOT_KEY, localSnapshot);
  writeJson(LOCAL_SNAPSHOT_INDEX_KEY, { sessionId, updatedAt: now, hasWork: snapshotHasWork(payload) });
  return localSnapshot;
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

function toast(message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("ems:studio-toast", { detail: { message } }));
}

export function useStudioRecovery(snapshot: StudioSnapshotInput, restore: (payload: Partial<StudioSnapshotInput>) => void) {
  const sessionId = useMemo(() => getSessionId(), []);
  const [status, setStatus] = useState<RecoveryStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [recoverable, setRecoverable] = useState<StudioSnapshot | null>(null);
  const restoreRef = useRef(restore);
  const snapshotRef = useRef(snapshot);
  const savingRef = useRef(false);
  const lastCloudSaveRef = useRef(0);
  restoreRef.current = restore;
  snapshotRef.current = snapshot;

  const saveLocal = useCallback(() => {
    if (!isAutosaveEnabled()) return null;
    const local = writeLocalRecoverySnapshot(sessionId, snapshotRef.current);
    if (local) {
      setRecoverable((current) => current ?? local);
      setLastSavedAt(local.updatedAt ?? new Date().toISOString());
    }
    return local;
  }, [sessionId]);

  const save = useCallback(async () => {
    if (!isAutosaveEnabled()) return;
    if (savingRef.current) return;
    savingRef.current = true;
    const localSnapshot = saveLocal();

    try {
      setStatus("checking");
      const fullSnapshot = mergeFullSnapshot(snapshotRef.current);
      const res = await fetch("/api/studio/session/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          roomId: "ems-main-room",
          ...fullSnapshot,
          playing: false,
          metadata: {
            source: "studio-workstation-bulletproof-autosave",
            autosave: true,
            localBackupAt: localSnapshot?.updatedAt ?? null,
            clipCount: fullSnapshot.clips?.length ?? 0,
            placedClipCount: fullSnapshot.placedClips?.length ?? 0,
            soundCount: fullSnapshot.soundLibrary?.length ?? 0,
            padAssignmentCount: Object.keys(fullSnapshot.padAssignments ?? {}).length,
            bufferCount: fullSnapshot.audioBuffers?.length ?? 0,\n            schemaVersion: SNAPSHOT_SCHEMA_VERSION,
          },
        }),
      });
      if (!res.ok) throw new Error(`Autosave failed ${res.status}`);
      const data = await res.json();
      const savedAt = data?.snapshot?.updatedAt ?? new Date().toISOString();
      setRecoverable(data?.snapshot ?? localSnapshot ?? null);
      setLastSavedAt(savedAt);
      setStatus(data?.backend === "database" ? "saved" : "recoverable");
      lastCloudSaveRef.current = Date.now();
    } catch {
      setRecoverable(localSnapshot ?? readLocalRecoverySnapshot());
      setStatus(localSnapshot ? "recoverable" : "error");
    } finally {
      savingRef.current = false;
    }
  }, [saveLocal, sessionId]);

  const fetchLatestSnapshot = useCallback(async () => {
    const localSnapshot = readLocalRecoverySnapshot();
    const res = await fetch(`/api/studio/session/snapshot?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Snapshot fetch failed ${res.status}`);
    const data = await res.json();
    const snapshotFromCloud = data?.snapshot as StudioSnapshot | null;
    const bestSnapshot = snapshotFromCloud?.payload ? { ...snapshotFromCloud, backend: data?.backend } : localSnapshot;
    if (bestSnapshot?.payload) {
      setRecoverable(bestSnapshot);
      setLastSavedAt(bestSnapshot.updatedAt ?? bestSnapshot.payload.savedAt ?? null);
      setStatus("recoverable");
      return bestSnapshot;
    }
    setRecoverable(null);
    setStatus("idle");
    return null;
  }, [sessionId]);

  useEffect(() => {
    const localSnapshot = readLocalRecoverySnapshot();
    if (localSnapshot?.payload) {
      setRecoverable(localSnapshot);
      setLastSavedAt(localSnapshot.updatedAt ?? localSnapshot.payload.savedAt ?? null);
      setStatus("recoverable");
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function check() {
      try {
        setStatus("checking");
        const latest = await fetchLatestSnapshot();
        if (!active) return;
        if (!latest?.payload) setStatus("idle");
      } catch {
        const localSnapshot = readLocalRecoverySnapshot();
        if (!active) return;
        if (localSnapshot?.payload) {
          setRecoverable(localSnapshot);
          setLastSavedAt(localSnapshot.updatedAt ?? localSnapshot.payload.savedAt ?? null);
          setStatus("recoverable");
        } else {
          setStatus("error");
        }
      }
    }
    void check();
    return () => { active = false; };
  }, [fetchLatestSnapshot]);

  useEffect(() => {
    if (!isAutosaveEnabled()) return;
    const firstSave = window.setTimeout(() => { void save(); }, 1200);
    const id = window.setInterval(() => { void save(); }, AUTOSAVE_INTERVAL_MS);
    return () => {
      window.clearTimeout(firstSave);
      window.clearInterval(id);
    };
  }, [save]);

  useEffect(() => {
    function emergencySave() {
      saveLocal();
      const now = Date.now();
      if (now - lastCloudSaveRef.current > AUTOSAVE_INTERVAL_MS) void save();
    }
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") emergencySave();
    }
    window.addEventListener("beforeunload", emergencySave);
    window.addEventListener("pagehide", emergencySave);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", emergencySave);
      window.removeEventListener("pagehide", emergencySave);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [save, saveLocal]);

  const restoreSnapshot = useCallback(async () => {
    try {
      setStatus("checking");
      let latest: StudioSnapshot | null = null;
      try {
        latest = await fetchLatestSnapshot();
      } catch {
        latest = readLocalRecoverySnapshot();
      }
      if (!latest?.payload) {
        toast("No saved studio snapshot found yet.");
        setStatus("idle");
        return;
      }
      const hasLocalWork = localSessionHasWork();
      const shouldRestore = !hasLocalWork || window.confirm("Restore saved studio session? This will replace the current local sounds, custom pads, and placed timeline clips with the saved snapshot.");
      if (!shouldRestore) {
        setStatus("recoverable");
        return;
      }
      restoreLocalSessionAddons(latest.payload);
      restoreRef.current(latest.payload);
      setStatus("restored");
      setRecoverable(latest);
      toast(latest.backend === "local" ? "Studio restored from local autosave." : "Studio restored from cloud autosave.");
    } catch {
      setStatus("error");
      toast("Restore failed. Current studio state was not changed.");
    }
  }, [fetchLatestSnapshot]);

  return { sessionId, status, lastSavedAt, recoverable, save, restoreSnapshot };
}
