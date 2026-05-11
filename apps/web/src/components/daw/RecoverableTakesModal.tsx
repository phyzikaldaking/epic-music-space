"use client";

import { useEffect, useState } from "react";
import {
  listPersistedTakes,
  loadPersistedTake,
  deletePersistedTake,
} from "./takeIdbStore";
import type { DawEngine, TrackId } from "./dawEngine";

// Modal that surfaces every persisted take in IndexedDB so a producer
// can recover from a tab crash or laptop sleep. Each row shows the
// track name + age + duration; "Restore" hot-swaps the take onto the
// matching track (or creates a new track if the original was deleted);
// "Discard" removes it from IDB.
//
// Opened from the crash-recovery banner when the in-flight breadcrumb
// indicates the last session died mid-take.

type Props = {
  engine: DawEngine;
  open: boolean;
  onClose: () => void;
  onNotice: (tone: "success" | "info" | "error", message: string) => void;
};

interface Row {
  id: string;
  trackId: string;
  trackName: string;
  durationSec: number;
  recordedAt: string;
}

function relativeAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export default function RecoverableTakesModal({
  engine,
  open,
  onClose,
  onNotice,
}: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void listPersistedTakes().then((list) => {
      if (cancelled) return;
      setRows(list);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function restore(row: Row) {
    setBusyId(row.id);
    try {
      const ctx = engine.audioContext;
      if (!ctx) {
        onNotice("error", "Audio engine not ready — press play first.");
        return;
      }
      const buf = await loadPersistedTake(ctx, row.id);
      if (!buf) {
        onNotice("error", "Couldn't read that take from disk.");
        return;
      }
      // Try to land on the original track. If it's gone (project
      // reload, track delete), spin up a new one named after the
      // recovered take.
      let targetId: TrackId | null = null;
      const snap = engine.getSnapshot();
      const existing = snap.tracks.find((t) => t.id === row.trackId);
      if (existing) {
        targetId = existing.id;
      } else {
        targetId = engine.addTrack(`${row.trackName} · recovered`, "#a78bfa");
      }
      engine.setTrackBuffer(targetId, buf);
      onNotice(
        "success",
        `Restored ${row.trackName} (${buf.duration.toFixed(1)}s) to the track lane.`,
      );
      // Drop the IDB entry now that it's safely back on the timeline.
      await deletePersistedTake(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } finally {
      setBusyId(null);
    }
  }

  async function discard(row: Row) {
    setBusyId(row.id);
    await deletePersistedTake(row.id);
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    setBusyId(null);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[170] grid place-items-center bg-black/70 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-amber-400/50 bg-zinc-950 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.32em] text-amber-300">
              Recover takes
            </div>
            <h2 className="mt-1 font-display text-xl uppercase tracking-wide">
              Audio survived the crash
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/20 px-3 py-1 text-[10px] uppercase tracking-widest hover:bg-white/10"
          >
            Close
          </button>
        </div>

        {loading ? (
          <p className="rounded-md border border-white/10 p-4 text-center text-sm text-white/55">
            Reading IndexedDB…
          </p>
        ) : rows.length === 0 ? (
          <p className="rounded-md border border-white/10 p-4 text-center text-sm text-white/55">
            No takes in cold storage. Nothing to recover.
          </p>
        ) : (
          <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
            {rows.map((r) => {
              const busy = busyId === r.id;
              return (
                <li
                  key={r.id}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-bold">{r.trackName}</div>
                    <div className="mt-0.5 text-[10px] uppercase tracking-widest text-white/45">
                      {r.durationSec.toFixed(1)}s · {relativeAge(r.recordedAt)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void restore(r)}
                    disabled={busy}
                    className="rounded-md border border-amber-400/40 bg-amber-500/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-100 hover:bg-amber-500/35 disabled:opacity-50"
                  >
                    {busy ? "…" : "Restore"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void discard(r)}
                    disabled={busy}
                    className="rounded-md border border-red-400/30 px-2 py-1 text-[10px] uppercase tracking-widest text-red-300 hover:bg-red-500/15 disabled:opacity-50"
                    aria-label="Discard recovered take"
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-[10px] uppercase tracking-widest text-white/40">
          IDB auto-prunes takes older than 14 days.
        </p>
      </div>
    </div>
  );
}
