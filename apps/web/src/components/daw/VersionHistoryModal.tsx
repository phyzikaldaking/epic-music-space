/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import { useFocusTrap } from "@/lib/useFocusTrap";

interface VersionRow {
  id: string;
  bpm: number;
  trackCount: number;
  label: string | null;
  createdAt: string;
}

interface Props {
  projectId: string;
  currentBpm: number;
  currentTrackCount: number;
  open: boolean;
  onClose: () => void;
  /** Called when the user picks a version to restore. The caller is
   *  responsible for fetching the full patternJson + hydrating the
   *  engine — this component only surfaces the metadata + selection. */
  onRestore: (versionId: string) => Promise<void>;
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

// Last-10 server-side snapshots modal. Each row shows BPM + track count
// + optional label + timestamp, plus a diff badge highlighting what
// changed from the current state. Restore hydrates the engine; failure
// leaves it untouched.
export default function VersionHistoryModal({
  projectId,
  currentBpm,
  currentTrackCount,
  open,
  onClose,
  onRestore,
}: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(open);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Escape dismisses the modal. Without this keyboard users had to
  // tab to the Close button to exit — every other modal in the app
  // is Esc-dismissable so this brings parity.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetch(`/api/studio/projects/${encodeURIComponent(projectId)}/versions`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { versions: VersionRow[] }) => {
        if (cancelled) return;
        setVersions(Array.isArray(data.versions) ? data.versions : []);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Couldn't load version history.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  async function handleRestore(versionId: string) {
    setRestoringId(versionId);
    try {
      await onRestore(versionId);
      onClose();
    } catch {
      setError("Couldn't restore that version. Try again.");
    } finally {
      setRestoringId(null);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Version history"
      ref={trapRef}
      className="fixed inset-0 z-[181] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
    >
      <div className="w-[min(560px,100%)] max-h-[85vh] overflow-y-auto rounded-2xl border border-violet-400/40 bg-[#0a0a10]/95 p-6 shadow-2xl shadow-black/50">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.32em] text-violet-300">
              Version history
            </p>
            <h2 className="mt-1 font-display text-xl uppercase tracking-wide text-white">
              Restore an earlier snapshot
            </h2>
            <p className="mt-1 text-xs text-white/55">
              Last 10 server-side snapshots. Restoring rewinds BPM, pattern
              and transport — track audio stays where it is.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close version history"
            className="rounded-md border border-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white/65 hover:bg-white/10"
          >
            Close
          </button>
        </div>

        <div className="mt-5 space-y-2">
          {loading && (
            <p className="text-sm text-white/55">Loading…</p>
          )}
          {error && (
            <p className="text-sm text-rose-300">{error}</p>
          )}
          {!loading && versions.length === 0 && !error && (
            <p className="text-sm text-white/55">
              No snapshots yet. Versions are captured on each auto-save
              after meaningful changes.
            </p>
          )}
          {versions.map((v) => {
            const bpmDelta = v.bpm - currentBpm;
            const trackDelta = v.trackCount - currentTrackCount;
            return (
              <div
                key={v.id}
                className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white/95">
                    {v.label ?? `Snapshot · ${v.bpm} BPM`}
                  </p>
                  <p className="truncate text-[11px] text-white/55">
                    {fmtTime(v.createdAt)} · {v.trackCount} tracks
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-[10px]">
                    {bpmDelta !== 0 && (
                      <span
                        className={`rounded-full px-1.5 ${
                          bpmDelta > 0
                            ? "bg-emerald-400/20 text-emerald-100"
                            : "bg-rose-400/20 text-rose-100"
                        }`}
                      >
                        BPM {bpmDelta > 0 ? "+" : ""}{bpmDelta}
                      </span>
                    )}
                    {trackDelta !== 0 && (
                      <span
                        className={`rounded-full px-1.5 ${
                          trackDelta > 0
                            ? "bg-emerald-400/20 text-emerald-100"
                            : "bg-rose-400/20 text-rose-100"
                        }`}
                      >
                        {trackDelta > 0 ? "+" : ""}{trackDelta} tracks
                      </span>
                    )}
                    {bpmDelta === 0 && trackDelta === 0 && (
                      <span className="rounded-full bg-white/10 px-1.5 text-white/55">
                        same shape
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRestore(v.id)}
                  disabled={restoringId !== null}
                  className="inline-flex items-center gap-1.5 rounded-md border border-violet-300/45 bg-violet-500/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-violet-100 hover:bg-violet-500/25 disabled:opacity-50 transition"
                >
                  {restoringId === v.id && (
                    <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-violet-200/40 border-t-violet-100" aria-hidden />
                  )}
                  {restoringId === v.id ? "Restoring" : "Restore"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
