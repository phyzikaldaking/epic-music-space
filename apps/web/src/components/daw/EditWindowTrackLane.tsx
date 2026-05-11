"use client";

import WaveformView from "./WaveformView";
import type { TrackState } from "./dawEngine";

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
}: Props) {
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
        className="flex shrink-0 items-center gap-2 border-r border-white/10 px-2"
        style={{ width: HEADER_WIDTH, borderLeft: `3px solid ${isFocused ? accent : accentFaded}` }}
      >
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

        {/* Name + meta */}
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-xs font-bold"
            style={{ color: isFocused ? accent : "rgba(255,255,255,0.9)" }}
          >
            {track.name}
          </div>
          <div className="mt-0.5 text-[9px] uppercase tracking-widest text-white/40">
            {track.hasAudio ? `${track.durationSec.toFixed(1)}s` : "Empty"}
            {track.muted ? " · M" : ""}
            {track.solo ? " · S" : ""}
          </div>
        </div>
      </div>

      {/* Waveform lane — fills the rest of the row */}
      <div className="relative flex-1 overflow-hidden">
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
