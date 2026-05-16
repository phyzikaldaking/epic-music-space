"use client";

import { useState } from "react";

type Props = {
  status: "idle" | "checking" | "saved" | "recoverable" | "restored" | "error";
  lastSavedAt: string | null;
  canRestore: boolean;
  onSave: () => void;
  onRestore: () => void;
};

type SnapshotSummary = {
  clipCount?: number;
  placedClipCount?: number;
  soundCount?: number;
  padAssignmentCount?: number;
};

type RecentSnapshot = {
  id: string;
  sessionId: string;
  version?: number;
  updatedAt?: string;
  createdAt?: string;
  payload?: Record<string, unknown>;
  summary?: SnapshotSummary;
};

const SESSION_ID_KEY = "ems-studio-session-id";

function label(status: Props["status"]) {
  if (status === "checking") return "Autosaving";
  if (status === "saved") return "Autosave on";
  if (status === "recoverable") return "Recovery ready";
  if (status === "restored") return "Restored";
  if (status === "error") return "Local autosave active";
  return "Autosave on";
}

function relativeTime(value: string | null | undefined) {
  if (!value) return "Not saved yet";
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (!Number.isFinite(diff)) return "Saved";
  const seconds = Math.max(0, Math.round(diff / 1000));
  if (seconds < 10) return "Saved just now";
  if (seconds < 60) return `Saved ${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Saved ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Saved ${hours}h ago`;
  return `Saved ${date.toLocaleDateString()}`;
}

function snapshotCounts(snapshot: RecentSnapshot) {
  const payload = snapshot.payload ?? {};
  const placedClips = snapshot.summary?.placedClipCount ?? (Array.isArray(payload.placedClips) ? payload.placedClips.length : 0);
  const clips = snapshot.summary?.clipCount ?? ((Array.isArray(payload.clips) ? payload.clips.length : 0) + placedClips);
  const sounds = snapshot.summary?.soundCount ?? (Array.isArray(payload.soundLibrary) ? payload.soundLibrary.length : 0);
  const pads = snapshot.summary?.padAssignmentCount ?? (payload.padAssignments && typeof payload.padAssignments === "object" ? Object.keys(payload.padAssignments).length : 0);
  return { clips, sounds, pads };
}

function emitToast(message: string) {
  window.dispatchEvent(new CustomEvent("ems:studio-toast", { detail: { message } }));
}

async function restoreSnapshotVersion(snapshotId: string) {
  const res = await fetch(`/api/studio/session/snapshot?snapshotId=${encodeURIComponent(snapshotId)}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Snapshot restore fetch failed");
  const data = await res.json();
  const payload = data?.snapshot?.payload;
  if (!payload) throw new Error("Snapshot payload missing");
  const ok = window.confirm("Restore this saved snapshot? This replaces current local sounds, pads, and placed timeline clips.");
  if (!ok) return;
  window.dispatchEvent(new CustomEvent("ems:studio-cloud-restored", { detail: payload }));
  emitToast("Saved snapshot version restored.");
}

async function duplicateSnapshot(snapshotId: string) {
  const res = await fetch("/api/studio/session/snapshot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "duplicate", snapshotId }),
  });
  if (!res.ok) throw new Error("Duplicate snapshot failed");
  const data = await res.json();
  if (data?.newSessionId) window.localStorage.setItem(SESSION_ID_KEY, data.newSessionId);
  const payload = data?.snapshot?.payload;
  if (payload) window.dispatchEvent(new CustomEvent("ems:studio-cloud-restored", { detail: payload }));
  emitToast("Snapshot duplicated as a new session.");
}

export default function StudioRecoveryStatus({ status, lastSavedAt, canRestore, onSave, onRestore }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<RecentSnapshot[]>([]);
  const tone = status === "error" ? "border-yellow-300/35 text-yellow-100" : status === "recoverable" ? "border-yellow-300/35 text-yellow-100" : status === "saved" || status === "restored" ? "border-green-300/30 text-green-100" : "border-cyan-300/30 text-cyan-100";
  const backendLabel = status === "error" ? "Local backup" : "Cloud + local";
  const cloudHealthy = status !== "error";

  async function loadRecent() {
    setLoading(true);
    try {
      const res = await fetch("/api/studio/session/snapshot?roomId=ems-main-room&limit=5", { cache: "no-store" });
      if (!res.ok) throw new Error("Recent snapshot fetch failed");
      const data = await res.json();
      setRecent(Array.isArray(data?.recent) ? data.recent : []);
      emitToast(data?.backend === "database" ? "Saved session history loaded." : "No cloud history yet. Local autosave is active.");
    } catch {
      emitToast("Could not load cloud history. Local autosave is still active.");
    } finally {
      setLoading(false);
    }
  }

  async function togglePanel() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) await loadRecent();
  }

  async function handleRestoreVersion(snapshotId: string) {
    try {
      await restoreSnapshotVersion(snapshotId);
    } catch {
      emitToast("Could not restore that saved version.");
    }
  }

  async function handleDuplicate(snapshotId: string) {
    try {
      await duplicateSnapshot(snapshotId);
      await loadRecent();
    } catch {
      emitToast("Could not duplicate that snapshot.");
    }
  }

  return (
    <div className="relative">
      <div className={`flex min-h-9 items-center gap-2 rounded-full border bg-black/45 px-2 py-1 text-[9px] font-black uppercase tracking-widest ${tone}`}>
        <button type="button" onClick={togglePanel} className="hidden lg:inline hover:text-white">
          {label(status)}
        </button>
        <span className="rounded-full border border-green-300/20 bg-green-300/10 px-2 py-1 text-green-100">Auto-save ON</span>
        <span className="rounded-full border border-white/10 px-2 py-1 text-white/45">{backendLabel}</span>
        <span className="hidden max-w-[110px] truncate text-white/35 xl:inline">{relativeTime(lastSavedAt)}</span>
        {canRestore && (
          <button type="button" onClick={onRestore} className="rounded-full border border-yellow-300/35 px-2 py-1 text-yellow-100 hover:bg-yellow-300/10">
            Restore Save
          </button>
        )}
        <button type="button" onClick={onSave} disabled={status === "checking"} className="rounded-full border border-cyan-300/25 px-2 py-1 text-cyan-100 hover:bg-cyan-300/10 disabled:opacity-45">
          Save Now
        </button>
        <button type="button" onClick={togglePanel} className="rounded-full border border-white/10 px-2 py-1 text-white/60 hover:bg-white/10">
          History
        </button>
      </div>

      {open && (
        <div className="absolute right-0 top-11 z-[80] w-[370px] rounded-2xl border border-white/10 bg-[#071015]/98 p-3 text-white shadow-2xl backdrop-blur">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200/70">Current session protection</p>
              <p className={`mt-1 text-xs font-bold ${cloudHealthy ? "text-green-200" : "text-yellow-200"}`}>{cloudHealthy ? "Auto-save writes to cloud and local backup" : "Cloud unavailable · local backup still active"}</p>
              <p className="mt-1 text-[10px] text-white/40">Status: {label(status)} · {relativeTime(lastSavedAt)}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-white/50">Close</button>
          </div>

          <div className="rounded-xl border border-green-300/15 bg-green-300/5 p-2 text-[10px] font-bold uppercase tracking-widest text-green-100/80">
            Protected: local recovery snapshot, cloud snapshot, timed autosave, tab-close save, and return-session restore.
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">Last 5 cloud snapshots</p>
            <button type="button" onClick={loadRecent} disabled={loading} className="rounded-full border border-cyan-300/25 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-cyan-100 disabled:opacity-50">
              {loading ? "Loading" : "Refresh"}
            </button>
          </div>

          <div className="mt-2 max-h-[280px] space-y-2 overflow-y-auto pr-1">
            {recent.length === 0 && <p className="rounded-xl border border-white/10 bg-white/[.03] p-3 text-xs text-white/45">No cloud snapshot versions yet. Auto-save still keeps a local recovery copy automatically.</p>}
            {recent.map((snapshot) => {
              const counts = snapshotCounts(snapshot);
              const time = snapshot.updatedAt ?? snapshot.createdAt;
              return (
                <div key={snapshot.id} className="rounded-xl border border-white/10 bg-white/[.035] p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-black uppercase tracking-widest text-white">Version {snapshot.version ?? "?"}</p>
                    <span className="shrink-0 text-[10px] text-white/40">{relativeTime(time)}</span>
                  </div>
                  <p className="mt-1 truncate text-[10px] text-white/35">{snapshot.sessionId}</p>
                  <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[10px] font-bold uppercase tracking-widest text-white/55">
                    <span className="rounded border border-white/10 px-2 py-1">{counts.clips} clips</span>
                    <span className="rounded border border-white/10 px-2 py-1">{counts.sounds} sounds</span>
                    <span className="rounded border border-white/10 px-2 py-1">{counts.pads} pads</span>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => handleRestoreVersion(snapshot.id)} className="flex-1 rounded-lg border border-yellow-300/35 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-yellow-100 hover:bg-yellow-300/10">
                      Restore this version
                    </button>
                    <button type="button" onClick={() => handleDuplicate(snapshot.id)} className="flex-1 rounded-lg border border-green-300/35 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-green-100 hover:bg-green-300/10">
                      Duplicate as new
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
