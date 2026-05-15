"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type StudioSnapshotInput = {
  mode: string;
  selectedTrack: string;
  bpm: number;
  bar: number;
  playing: boolean;
  tracks: unknown[];
  workspaceLayout?: unknown;
};

type StudioSnapshot = {
  sessionId: string;
  payload?: Partial<StudioSnapshotInput> & { savedAt?: string };
  version?: number;
  updatedAt?: string;
};

type RecoveryStatus = "idle" | "checking" | "saved" | "recoverable" | "restored" | "error";

function getSessionId() {
  if (typeof window === "undefined") return "ems-main-session";
  const key = "ems-studio-session-id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const created = `ems-${Date.now()}-${crypto.randomUUID()}`;
  window.localStorage.setItem(key, created);
  return created;
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
      const res = await fetch("/api/studio/session/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, roomId: "ems-main-room", ...snapshot, playing: false, metadata: { source: "studio-workstation-autosave" } }),
      });
      if (!res.ok) throw new Error(`Autosave failed ${res.status}`);
      const data = await res.json();
      const savedAt = data?.snapshot?.updatedAt ?? new Date().toISOString();
      setLastSavedAt(savedAt);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }, [sessionId, snapshot]);

  useEffect(() => {
    let active = true;
    async function check() {
      try {
        setStatus("checking");
        const res = await fetch(`/api/studio/session/snapshot?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!active) return;
        if (data?.snapshot?.payload) {
          setRecoverable(data.snapshot);
          setLastSavedAt(data.snapshot.updatedAt ?? null);
          setStatus("recoverable");
        } else {
          setStatus("idle");
        }
      } catch {
        if (active) setStatus("error");
      }
    }
    void check();
    return () => { active = false; };
  }, [sessionId]);

  useEffect(() => {
    const id = window.setInterval(() => { void save(); }, 15000);
    return () => window.clearInterval(id);
  }, [save]);

  const restoreSnapshot = useCallback(() => {
    if (!recoverable?.payload) return;
    restoreRef.current(recoverable.payload);
    setStatus("restored");
  }, [recoverable]);

  return { sessionId, status, lastSavedAt, recoverable, save, restoreSnapshot };
}
