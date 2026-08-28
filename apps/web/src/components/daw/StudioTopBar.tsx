"use client";

import Link from "next/link";

import { StudioTooltip } from "@/components/ui/StudioTooltip";
import { tooltips } from "./tooltipCopy";

// Pro Tools-style top toolbar. Single thin strip that owns the
// transport pill, the time + BPM readouts, and the Edit/Mix/Beat/
// Publish mode tabs. Everything else (audio settings, tempo map,
// sample chopper, mix tools) lives in a right-side drawer triggered
// by the ⚙ icon on the far right.
//
// Designed to take ~64px of vertical space — that's it. Everything
// below this row is the actual workspace.

export type StudioMainMode = "edit" | "mix" | "beat" | "sounds" | "publish";

type Props = {
  isPlaying: boolean;
  isRecording: boolean;
  positionSec: number;
  bpm: number;
  mode: StudioMainMode;
  drawerOpen: boolean;
  onPlayPause: () => void;
  onStop: () => void;
  onRecord: () => void;
  onReturnToZero: () => void;
  onNudge: (sec: number) => void;
  onBpmChange: (bpm: number) => void;
  onModeChange: (mode: StudioMainMode) => void;
  onToggleDrawer: () => void;
};

const MODE_TABS: Array<{ id: StudioMainMode; label: string; hint: string }> = [
  { id: "edit", label: "Edit", hint: "Track lanes + recording" },
  { id: "mix", label: "Mix", hint: "Faders + EQ + master" },
  { id: "beat", label: "Beat", hint: "Drum machine grid" },
  { id: "sounds", label: "Sounds", hint: "Preview and load Studio sound kits" },
  { id: "publish", label: "Publish", hint: "Master + release" },
];

function formatTime(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function StudioTopBar({
  isPlaying,
  isRecording,
  positionSec,
  bpm,
  mode,
  drawerOpen,
  onPlayPause,
  onStop,
  onRecord,
  onReturnToZero,
  onNudge,
  onBpmChange,
  onModeChange,
  onToggleDrawer,
}: Props) {
  return (
    <header
      className="sticky top-[64px] z-30 flex flex-wrap items-center gap-2 border-b border-white/10 bg-black/85 px-2 py-2 backdrop-blur sm:flex-nowrap sm:gap-3 sm:px-3"
      data-studio-topbar
    >
      {/* Transport pill */}
      <div className="flex items-center gap-1 rounded-full border border-white/15 bg-black/60 p-1 shadow-inner shadow-black/40">
        <button
          type="button"
          onClick={onReturnToZero}
          className="grid h-8 w-8 place-items-center rounded-full text-white/80 hover:bg-white/10"
          aria-label="Return to start"
          title="Return to start"
        >
          <span aria-hidden className="text-sm">⏮</span>
        </button>
        <button
          type="button"
          onClick={() => onNudge(-5)}
          className="grid h-8 w-8 place-items-center rounded-full text-white/80 hover:bg-white/10"
          aria-label="Rewind 5s"
          title="Rewind 5s (Shift + ←)"
        >
          <span aria-hidden className="text-sm">⏪</span>
        </button>
        <StudioTooltip label={tooltips.transportPlay} shortcut="Space">
          <button
            type="button"
            onClick={onPlayPause}
            className={`grid h-10 w-10 place-items-center rounded-full text-base font-black shadow ${
              isPlaying
                ? "bg-amber-400 text-black shadow-amber-400/40 hover:bg-amber-300"
                : "bg-emerald-500 text-black shadow-emerald-500/40 hover:bg-emerald-400"
            }`}
            aria-label={isPlaying ? "Pause" : "Play"}
            data-tour="play-button"
          >
            <span aria-hidden className="text-base">
              {isPlaying ? "⏸" : "▶"}
            </span>
          </button>
        </StudioTooltip>
        <button
          type="button"
          onClick={onStop}
          className="grid h-8 w-8 place-items-center rounded-full text-white/80 hover:bg-white/10"
          aria-label="Stop"
          title="Stop"
        >
          <span aria-hidden className="text-sm">⏹</span>
        </button>
        <button
          type="button"
          onClick={() => onNudge(5)}
          className="grid h-8 w-8 place-items-center rounded-full text-white/80 hover:bg-white/10"
          aria-label="Fast-forward 5s"
          title="Fast-forward 5s (Shift + →)"
        >
          <span aria-hidden className="text-sm">⏩</span>
        </button>
        <StudioTooltip label={tooltips.transportRecord} shortcut="R">
          <button
            type="button"
            onClick={onRecord}
            className={`grid h-10 w-10 place-items-center rounded-full text-base font-black shadow transition ${
              isRecording
                ? "bg-red-600 text-white shadow-red-500/40 animate-pulse"
                : "bg-red-500/15 text-red-300 hover:bg-red-500/30"
            }`}
            aria-label="Record"
          >
            <span aria-hidden className="text-base">⏺</span>
          </button>
        </StudioTooltip>
      </div>

      {/* Time + BPM. Hidden on the smallest screens (xs) where the
          transport pill already takes the full row; reappears at sm. */}
      <div className="hidden items-center gap-3 rounded-md border border-white/10 bg-black/50 px-3 py-1 font-mono text-sm sm:flex">
        <span
          className={`tabular-nums ${
            isRecording ? "text-red-300" : isPlaying ? "text-emerald-300" : "text-white/85"
          }`}
        >
          {formatTime(positionSec)}
        </span>
        <span className="text-white/30">·</span>
        <label className="flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-widest text-white/45">BPM</span>
          <input
            type="number"
            min={40}
            max={220}
            value={bpm}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (Number.isFinite(v)) onBpmChange(Math.max(40, Math.min(220, v)));
            }}
            className="w-14 rounded border border-white/10 bg-black/40 px-1 py-0.5 text-right text-xs"
            aria-label="BPM"
          />
        </label>
      </div>

      {/* Mode tabs — the whole point of this bar. On phones we let it
          wrap to a second row by removing the auto-margin; on tablet+
          it pins to the right edge. */}
      <nav
        className="order-3 flex w-full items-center gap-0.5 rounded-md border border-white/10 bg-black/40 p-0.5 sm:order-none sm:ml-auto sm:w-auto"
        aria-label="Studio main view"
      >
        {MODE_TABS.map((tab) => {
          const active = mode === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onModeChange(tab.id)}
              className={`rounded px-3 py-1.5 text-[11px] font-black uppercase tracking-widest transition ${
                active
                  ? "bg-cyan-400/25 text-cyan-100 shadow-inner shadow-cyan-500/30"
                  : "text-white/65 hover:bg-white/[0.06]"
              }`}
              title={tab.hint}
              aria-pressed={active ? "true" : "false"}
            >
              {tab.label}
            </button>
          );
        })}
        <Link
          href="/music-consultant"
          className="rounded px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-amber-200 transition hover:bg-amber-400/10"
          title="Music Consultant · Artist Rights Center"
        >
          Consultant
        </Link>
      </nav>

      {/* Drawer toggle */}
      <button
        type="button"
        onClick={onToggleDrawer}
        className={`grid h-9 w-9 place-items-center rounded-md border transition ${
          drawerOpen
            ? "border-cyan-400/50 bg-cyan-500/20 text-cyan-100"
            : "border-white/15 bg-black/40 text-white/70 hover:bg-white/10"
        }`}
        aria-label="Toggle settings drawer"
        title="Settings, tempo map, tools (⌘.)"
      >
        <span aria-hidden className="text-base">⚙</span>
      </button>
    </header>
  );
}
