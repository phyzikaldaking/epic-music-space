"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type RealtimeBridgeInput = {
  projectId?: string;
  sessionId?: string;
  clientId?: string;
};

type Operation = {
  type: "state.patch" | "track.upsert" | "track.delete" | "transport.patch" | "selection.set" | "beat.pattern" | "midi.event" | "undo" | "redo";
  target?: string;
  payload?: Record<string, unknown>;
};

function getClientId() {
  if (typeof window === "undefined") return "server-client";
  const key = "ems-studio-client-id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const created = `client-${crypto.randomUUID()}`;
  window.localStorage.setItem(key, created);
  return created;
}

export function useStudioRealtimeBridge({ projectId = "ems-default-project", sessionId = "ems-main-session", clientId }: RealtimeBridgeInput = {}) {
  const resolvedClientId = useMemo(() => clientId ?? getClientId(), [clientId]);
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState<"idle" | "syncing" | "synced" | "conflict" | "error">("idle");
  const [lastMessage, setLastMessage] = useState("Realtime sync ready.");
  const revisionRef = useRef(0);

  const pull = useCallback(async () => {
    try {
      const res = await fetch(`/api/studio/realtime?sessionId=${encodeURIComponent(sessionId)}&projectId=${encodeURIComponent(projectId)}&afterRevision=${revisionRef.current}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Realtime pull ${res.status}`);
      const nextRevision = Number(data?.state?.revision ?? revisionRef.current);
      revisionRef.current = nextRevision;
      setRevision(nextRevision);
      setStatus("synced");
      setLastMessage(`Synced revision ${nextRevision}`);
      return data;
    } catch (error) {
      setStatus("error");
      setLastMessage(error instanceof Error ? error.message : "Realtime pull failed.");
      return null;
    }
  }, [projectId, sessionId]);

  const push = useCallback(async (operation: Operation) => {
    setStatus("syncing");
    try {
      const res = await fetch("/api/studio/realtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...operation, sessionId, projectId, clientId: resolvedClientId, baseRevision: revisionRef.current }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.error) throw new Error(data?.error ?? `Realtime push ${res.status}`);
      const nextRevision = Number(data?.revision ?? revisionRef.current + 1);
      revisionRef.current = nextRevision;
      setRevision(nextRevision);
      setStatus(data?.conflict ? "conflict" : "synced");
      setLastMessage(data?.conflict ? `Conflict resolved at revision ${nextRevision}` : `Saved revision ${nextRevision}`);
      return data;
    } catch (error) {
      setStatus("error");
      setLastMessage(error instanceof Error ? error.message : "Realtime push failed.");
      return null;
    }
  }, [projectId, resolvedClientId, sessionId]);

  useEffect(() => { void pull(); const id = window.setInterval(() => { void pull(); }, 10000); return () => window.clearInterval(id); }, [pull]);

  return { status, revision, lastMessage, push, pull };
}
