"use client";

import { useMemo, useState } from "react";
import type { DawEngine, TrackId, RecordedTake } from "./dawEngine";

// Per-track take browser. Lists every recording captured this session,
// renders each as a tiny sparkline (peaks pre-computed by the engine),
// and lets the producer A/B between them. Picking a keeper hot-swaps
// the track buffer without re-recording, so a "I liked take 2 better"
// moment is a single click.

type Props = {
  engine: DawEngine;
  trackId: TrackId;
  trackName: string;
  open: boolean;
  onClose: () => void;
};

export default function TakeBrowserModal({
  engine,
  trackId,
  trackName,
  open,
  onClose,
}: Props) {
  // Snapshot the take list when the modal opens. We re-read on each
  // user action below rather than subscribing to the whole engine
  // because the take list rarely changes mid-browse.
  const [tick, setTick] = useState(0);
  const takes = useMemo(
    () => engine.listTakes(trackId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, trackId, tick],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[170] grid place-items-center bg-black/70 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-cyan-500/40 bg-zinc-950 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.32em] text-cyan-300">
              Take browser
            </div>
            <h2 className="mt-1 font-display text-xl uppercase tracking-wide">
              {trackName}
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

        {takes.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-white/55">
            No takes yet. Record this track and your captures will land
            here so you can A/B between them.
          </p>
        ) : (
          <ul className="space-y-2">
            {takes.map((take, idx) => (
              <TakeRow
                key={take.id}
                take={take}
                index={takes.length - idx}
                onPick={() => {
                  engine.setKeeperTake(trackId, take.id);
                  setTick((t) => t + 1);
                }}
                onDelete={() => {
                  engine.deleteTake(trackId, take.id);
                  setTick((t) => t + 1);
                }}
                onLabel={(label) => {
                  engine.labelTake(trackId, take.id, label);
                  setTick((t) => t + 1);
                }}
                onNote={(note) => {
                  engine.noteTake(trackId, take.id, note);
                  setTick((t) => t + 1);
                }}
              />
            ))}
          </ul>
        )}

        <p className="mt-4 text-[10px] uppercase tracking-widest text-white/40">
          Up to 16 takes per track · oldest drop off automatically
        </p>
      </div>
    </div>
  );
}

function TakeRow({
  take,
  index,
  onPick,
  onDelete,
  onLabel,
  onNote,
}: {
  take: RecordedTake;
  index: number;
  onPick: () => void;
  onDelete: () => void;
  onLabel: (label: string) => void;
  onNote: (note: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(take.label ?? `Take ${index}`);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState(take.note ?? "");

  const time = new Date(take.recordedAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <li
      className={`rounded-xl border p-3 ${
        take.isKeeper
          ? "border-cyan-400 bg-cyan-500/10"
          : take.clipped
            ? "border-red-400/40 bg-red-500/5"
            : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex flex-1 items-center gap-3 min-w-0">
          <Sparkline peaks={take.peaks} clipped={take.clipped} />
          <div className="min-w-0 flex-1">
            {editing ? (
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value.slice(0, 60))}
                onBlur={() => {
                  onLabel(label);
                  setEditing(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onLabel(label);
                    setEditing(false);
                  }
                }}
                autoFocus
                aria-label="Take label"
                placeholder="Take name"
                className="w-full rounded-md border border-white/15 bg-black/40 px-2 py-0.5 text-sm outline-none focus:border-cyan-400"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="line-clamp-1 text-left text-sm font-semibold hover:underline"
                title="Click to rename"
              >
                {take.label ?? `Take ${index}`}
              </button>
            )}
            <div className="text-[10px] text-white/45">
              {time} · {take.durationSec.toFixed(1)}s · peak{" "}
              {(take.peakAmplitude * 100).toFixed(0)}%
              {take.isKeeper && (
                <span className="ml-2 rounded-full bg-cyan-400/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-cyan-200">
                  Keeper
                </span>
              )}
              {take.clipped && (
                <span
                  className="ml-2 rounded-full bg-red-500/25 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-red-200"
                  title="Take peaked at digital ceiling — re-record with lower input gain"
                >
                  ⚠ Clipped
                </span>
              )}
              {take.note && !noteOpen && (
                <span className="ml-2 text-[9px] italic text-white/55">
                  · note saved
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setNoteOpen((v) => !v)}
            className="rounded-md border border-white/15 px-2 py-1 text-[10px] uppercase tracking-widest text-white/70 hover:bg-white/10"
            title="Add a note about this take"
            aria-label="Toggle take note"
          >
            📝
          </button>
          {!take.isKeeper && (
            <button
              type="button"
              onClick={onPick}
              className="rounded-md border border-cyan-400/40 bg-cyan-500/15 px-3 py-1 text-[10px] font-black uppercase tracking-widest hover:bg-cyan-500/25"
            >
              Use this
            </button>
          )}
          {!take.isKeeper && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md border border-red-400/30 px-2 py-1 text-[10px] uppercase tracking-widest text-red-300 hover:bg-red-500/15"
              title="Delete this take"
              aria-label="Delete take"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      {noteOpen && (
        <div className="mt-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 280))}
            onBlur={() => onNote(note)}
            placeholder="Note about this take (e.g. 'breath control got better here')"
            rows={2}
            className="w-full rounded-md border border-white/15 bg-black/30 px-2 py-1 text-xs outline-none focus:border-cyan-400"
          />
          <div className="mt-0.5 text-right text-[9px] text-white/45">
            {note.length}/280
          </div>
        </div>
      )}
    </li>
  );
}

function Sparkline({ peaks, clipped }: { peaks: number[]; clipped?: boolean }) {
  // Cheap SVG sparkline: peaks already pre-normalised to 0..1.
  // Clipped takes paint in red so the producer scans the list and
  // immediately spots the bad-input takes.
  const width = 120;
  const height = 36;
  const step = width / Math.max(1, peaks.length);
  const fill = clipped ? "rgba(239,68,68,0.7)" : "rgba(34,211,238,0.65)";
  return (
    <svg width={width} height={height} className="shrink-0">
      <rect width={width} height={height} fill="rgba(255,255,255,0.04)" rx={4} />
      {peaks.map((p, i) => {
        const h = Math.max(1, p * (height - 2));
        return (
          <rect
            key={i}
            x={i * step}
            y={(height - h) / 2}
            width={Math.max(0.5, step - 0.5)}
            height={h}
            fill={fill}
          />
        );
      })}
    </svg>
  );
}
