"use client";

import { useEffect, useState } from "react";
import {
  listUndoSnapshots,
  restoreUndoSnapshotById,
  type UndoSnapshotInfo,
} from "./undoStorage";

interface Props {
  projectId: string | null;
  /** Bump to force a re-list — DawWorkspace bumps this whenever a new
   *  snapshot is pushed so the panel doesn't show stale entries. */
  refreshKey: number;
  /** Called with the restored file payload so the workspace can hydrate
   *  the engine and re-broadcast presence. Failure should leave the
   *  engine untouched. */
  onJumpToSnapshot: (id: number) => Promise<void>;
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  } catch {
    return iso;
  }
}

// Collapsible side panel listing the last 20 undo snapshots. Clicking an
// entry jumps the engine to that state and prunes any newer entries
// (forward-history is invalidated by stepping back). Each entry shows
// its label + timestamp so the user knows what they're rewinding into.
export default function UndoTimelinePanel({
  projectId,
  refreshKey,
  onJumpToSnapshot,
}: Props) {
  const [open, setOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<UndoSnapshotInfo[]>([]);
  const [jumpingId, setJumpingId] = useState<number | null>(null);

  useEffect(() => {
    if (!projectId || !open) {
      setSnapshots([]);
      return;
    }
    let cancelled = false;
    void listUndoSnapshots(projectId)
      .then((list) => {
        if (cancelled) return;
        // Newest first, cap at 20. The store keeps up to 30 but the UI
        // only needs the recent slice to be useful.
        setSnapshots(list.slice(-20).reverse());
      })
      .catch(() => {
        if (cancelled) return;
        setSnapshots([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, open, refreshKey]);

  if (!projectId) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white/65 transition hover:bg-white/10"
        title="Undo timeline — jump to any recent snapshot"
        aria-expanded={open}
      >
        <span aria-hidden>↶</span>
        History
        {snapshots.length > 0 && (
          <span className="rounded-full bg-white/10 px-1.5 text-[9px] tabular-nums text-white/55">
            {snapshots.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-white/15 bg-[#0c0c14] p-3 shadow-2xl">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-[0.32em] text-amber-300/85">
              Undo timeline
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm text-white/45 hover:text-white"
              aria-label="Close undo timeline"
            >
              ✕
            </button>
          </div>
          {snapshots.length === 0 ? (
            <p className="text-xs text-white/45">
              No snapshots yet. Snapshots are captured ~3s after each edit.
            </p>
          ) : (
            <ul className="max-h-[320px] space-y-1 overflow-y-auto" role="list">
              {snapshots.map((s, idx) => {
                const isCurrent = idx === 0;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={async () => {
                        if (isCurrent) return;
                        setJumpingId(s.id);
                        try {
                          await onJumpToSnapshot(s.id);
                          // Re-list — entries past the target are gone.
                          if (projectId) {
                            const fresh = await listUndoSnapshots(projectId);
                            setSnapshots(fresh.slice(-20).reverse());
                          }
                        } finally {
                          setJumpingId(null);
                        }
                      }}
                      disabled={isCurrent || jumpingId !== null}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left transition ${
                        isCurrent
                          ? "border-amber-400/40 bg-amber-400/10"
                          : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                      } ${jumpingId === s.id ? "opacity-50" : ""}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-bold text-white/95">
                          {s.label}
                        </span>
                        <span className="block truncate text-[10px] text-white/45">
                          {fmtTime(s.capturedAt)}
                        </span>
                      </span>
                      {isCurrent && (
                        <span className="rounded bg-amber-400/30 px-1.5 text-[9px] font-black uppercase tracking-widest text-amber-100">
                          Now
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 text-[10px] text-white/35">
            Tip: Cmd+Z steps one back. Click any entry to jump straight to it.
          </p>
        </div>
      )}
    </div>
  );
}

// Re-export so DawWorkspace can call the same jump path used internally.
export { restoreUndoSnapshotById };
