"use client";

import { useState } from "react";
import WaveformView from "./WaveformView";
import type { TrackState } from "./dawEngine";

// Pro Tools-style accent palette. 8 picks that read well on the
// dark canvas; each track defaults into the cycle but the user can
// recolor from the popover.
const TRACK_COLOR_PRESETS = [
  "#ec4899", // pink
  "#22d3ee", // cyan
  "#a78bfa", // violet
  "#f59e0b", // amber
  "#34d399", // emerald
  "#f87171", // red
  "#60a5fa", // blue
  "#fbbf24", // gold
];

// Pro Tools edit-window track lane. Single horizontal row:
//
//   [ track header — 200px ][ waveform lane — fills the rest ]
//
// The header shows the track name + arm / mute / solo / record-enable
// dots. The lane fills the rest of the row and holds the waveform
// (or "Empty" placeholder when no audio is attached yet). Lanes
// stack vertically so the user sees many tracks at once, like a
// real DAW edit window.

const HEADER_WIDTH = 200; // px

type Props = {
  track: TrackState;
  peaks: number[];
  progress: number;
  bpm: number;
  isFocused: boolean;
  onFocus: () => void;
  onToggleArm: () => void;
  onToggleMute: () => void;
  onToggleSolo: () => void;
  onSeek: (sec: number) => void;
  /** Recolor handler. When omitted, the color stripe is non-interactive. */
  onSetColor?: (color: string) => void;
  /** Rename handler. When omitted, the name is read-only. */
  onSetName?: (name: string) => void;
  /** Open the AI Melodyne note-level pitch editor for this track.
   *  Omitted when the track has no audio. */
  onOpenMelodyne?: () => void;
  /** Run a fast automatic pitch-correction pass on this track. */
  onQuickTune?: () => void;
};

export default function EditWindowTrackLane({
  track,
  peaks,
  progress,
  bpm,
  isFocused,
  onFocus,
  onToggleArm,
  onToggleMute,
  onToggleSolo,
  onSeek,
  onSetColor,
  onSetName,
  onOpenMelodyne,
  onQuickTune,
}: Props) {
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(track.name);
  // Lane height: 76px gives the waveform room to read; small enough
  // that 8-10 tracks fit on a 1080p display without scrolling.
  const laneHeight = 76;
  const accent = track.color;
  // Lazy hex → rgba so the focus rail can take the track color but at
  // ~25% opacity.
  const accentFaded = `${accent}40`;

  return (
    <div
      className={`flex border-b border-white/[0.06] transition-colors ${
        isFocused ? "bg-white/[0.04]" : "bg-transparent hover:bg-white/[0.02]"
      }`}
      style={{ minHeight: laneHeight }}
      data-track-id={track.id}
      onClick={onFocus}
    >
      {/* Track header */}
      <div
        className="relative flex shrink-0 items-center gap-2 border-r border-white/10 px-2"
        style={{ width: HEADER_WIDTH, borderLeft: `3px solid ${isFocused ? accent : accentFaded}` }}
      >
        {/* Color swatch — click opens a tiny preset picker. We avoid
            the native <input type=color> because it triggers an OS
            chooser that's slow and overkill; eight tasteful presets
            cover every real DAW workflow. */}
        {onSetColor && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setColorPickerOpen((v) => !v);
            }}
            className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/30 transition hover:scale-110"
            style={{ background: accent }}
            aria-label="Pick track color"
            title="Pick track color"
          />
        )}
        {colorPickerOpen && onSetColor && (
          <div
            className="absolute left-2 top-7 z-30 flex gap-1 rounded-md border border-white/15 bg-black/90 p-1.5 shadow-lg shadow-black/60"
            onClick={(e) => e.stopPropagation()}
          >
            {TRACK_COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onSetColor(c);
                  setColorPickerOpen(false);
                }}
                className={`h-4 w-4 rounded-full border transition hover:scale-110 ${
                  c.toLowerCase() === accent.toLowerCase()
                    ? "border-white"
                    : "border-white/30"
                }`}
                style={{ background: c }}
                aria-label={`Set color ${c}`}
              />
            ))}
          </div>
        )}
        {/* Dual-needle PPM: RMS bar with peak tip overlaid on top.
            Reads like a real meter — RMS shows perceived loudness,
            peak tip shows transient ceiling. */}
        <PpmMeter peak={track.level} rms={track.levelRms ?? 0} accent={accent} />
        {/* Arm / Mute / Solo cluster */}
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleArm();
            }}
            className={`grid h-5 w-5 place-items-center rounded-sm text-[9px] font-black uppercase tracking-widest transition ${
              track.armed
                ? "bg-red-500 text-white shadow-[0_0_8px_rgba(239,68,68,0.6)]"
                : "border border-white/15 bg-black/40 text-white/55 hover:bg-white/10"
            }`}
            aria-label={`Arm ${track.name} for recording`}
            aria-pressed={track.armed ? "true" : "false"}
            title="Arm for recording"
          >
            R
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleMute();
            }}
            className={`grid h-5 w-5 place-items-center rounded-sm text-[9px] font-black uppercase tracking-widest transition ${
              track.muted
                ? "bg-amber-400 text-black"
                : "border border-white/15 bg-black/40 text-white/55 hover:bg-white/10"
            }`}
            aria-label={`Mute ${track.name}`}
            aria-pressed={track.muted ? "true" : "false"}
            title="Mute"
          >
            M
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSolo();
            }}
            className={`grid h-5 w-5 place-items-center rounded-sm text-[9px] font-black uppercase tracking-widest transition ${
              track.solo
                ? "bg-cyan-400 text-black"
                : "border border-white/15 bg-black/40 text-white/55 hover:bg-white/10"
            }`}
            aria-label={`Solo ${track.name}`}
            aria-pressed={track.solo ? "true" : "false"}
            title="Solo"
          >
            S
          </button>
        </div>

        {/* Name + meta. Double-click the name to rename inline. */}
        <div className="min-w-0 flex-1">
          {renaming && onSetName ? (
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value.slice(0, 40))}
              onBlur={() => {
                onSetName(draftName.trim() || track.name);
                setRenaming(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onSetName(draftName.trim() || track.name);
                  setRenaming(false);
                }
                if (e.key === "Escape") {
                  setDraftName(track.name);
                  setRenaming(false);
                }
                e.stopPropagation();
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full rounded border border-white/15 bg-black/50 px-1 py-0.5 text-xs font-bold outline-none focus:border-cyan-400"
              aria-label="Rename track"
            />
          ) : (
            <div
              className="truncate text-xs font-bold cursor-text"
              style={{ color: isFocused ? accent : "rgba(255,255,255,0.9)" }}
              onDoubleClick={(e) => {
                if (!onSetName) return;
                e.stopPropagation();
                setDraftName(track.name);
                setRenaming(true);
              }}
              title={onSetName ? "Double-click to rename" : undefined}
            >
              {track.name}
            </div>
          )}
          <div className="mt-0.5 text-[9px] uppercase tracking-widest text-white/40">
            {track.hasAudio ? `${track.durationSec.toFixed(1)}s` : "Empty"}
            {track.muted ? " · M" : ""}
            {track.solo ? " · S" : ""}
          </div>
        </div>
      </div>

      {/* Waveform lane — fills the rest of the row */}
      <div className="relative flex-1 overflow-hidden">
        {track.hasAudio && (onQuickTune || onOpenMelodyne) && (
          <div className="absolute right-2 top-2 z-10 flex h-7 overflow-hidden rounded-md border border-cyan-400/40 bg-black/75 text-[10px] font-black uppercase tracking-widest text-cyan-100 shadow-lg shadow-black/40 backdrop-blur">
            {onQuickTune && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickTune();
                }}
                className="grid min-w-12 place-items-center px-2 transition hover:bg-cyan-500/20"
                title="Run one-click Auto-Tune on this track"
              >
                Auto
              </button>
            )}
            {onOpenMelodyne && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenMelodyne();
                }}
                className="grid min-w-12 place-items-center border-l border-cyan-400/25 px-2 transition hover:bg-cyan-500/20"
                title="Open the note-level pitch editor"
              >
                Edit
              </button>
            )}
          </div>
        )}
        {peaks.length > 0 ? (
          <WaveformView
            peaks={peaks}
            color={accent}
            progress={progress}
            durationSec={track.durationSec}
            onScrub={onSeek}
            bpm={bpm}
            snapDivisor={null}
            className="h-full w-full"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-widest text-white/25">
            {track.armed ? "Armed · press ⏺ to record" : "Drop audio or arm + record"}
          </div>
        )}
      </div>
    </div>
  );
}

// Vertical PPM strip: a thin RMS fill with a peak-tip line riding on
// top. Maps amplitude 0..1 → 0..100% of the strip height. Peak goes
// red ≥ 0.95 (within ~0.4 dB of clip). Pure CSS, no canvas — repaints
// at React's snapshot rate (~30 fps) which is plenty for a meter.
function PpmMeter({
  peak,
  rms,
  accent,
}: {
  peak: number;
  rms: number;
  accent: string;
}) {
  const peakPct = Math.max(0, Math.min(100, peak * 100));
  const rmsPct = Math.max(0, Math.min(100, rms * 100));
  const clipping = peak >= 0.95;
  return (
    <div
      className="relative h-12 w-1.5 shrink-0 overflow-hidden rounded-sm border border-white/10 bg-black/60"
      aria-hidden
      title={`peak ${(peak * 100).toFixed(0)}% · rms ${(rms * 100).toFixed(0)}%`}
    >
      {/* RMS bar — fills bottom-up at the smoothed level. */}
      <div
        className="absolute bottom-0 left-0 right-0 transition-[height] duration-75"
        style={{
          height: `${rmsPct}%`,
          background: accent,
          opacity: 0.55,
        }}
      />
      {/* Peak tip — 2px line at the peak height. */}
      <div
        className="absolute left-0 right-0 h-[2px] transition-[bottom] duration-75"
        style={{
          bottom: `${peakPct}%`,
          background: clipping ? "#f87171" : accent,
        }}
      />
    </div>
  );
}
