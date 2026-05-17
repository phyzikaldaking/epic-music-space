"use client";

import Link from "next/link";
import { memo } from "react";
import StudioRecoveryStatus from "./StudioRecoveryStatus";

type Props = {
  playing: boolean;
  bpm: number;
  bar: number;
  realtimeStatus: string;
  realtimeRevision: number;
  canUndo: boolean;
  canRedo: boolean;
  onTogglePlay: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onChangeBpm: (delta: number) => void;
  recoveryStatus: string;
  lastSavedAt: string | null;
  canRestore: boolean;
  onSave: () => void;
  onRestore: () => void;
};

function StudioTransportBar({
  playing,
  bpm,
  bar,
  realtimeStatus,
  realtimeRevision,
  canUndo,
  canRedo,
  onTogglePlay,
  onUndo,
  onRedo,
  onChangeBpm,
  recoveryStatus,
  lastSavedAt,
  canRestore,
  onSave,
  onRestore,
}: Props) {
  const transportPercent = Math.min(100, Math.max(0, bar / 1.28));
  const syncProblem = realtimeStatus === "conflict" || realtimeStatus === "error";

  return (
    <header className="flex min-h-10 shrink-0 items-center gap-2 border-b border-black/80 bg-[#11171a] px-3 py-1.5 shadow-[0_10px_24px_rgba(0,0,0,.35)]">
      <Link href="/" title="Home" className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/10 bg-black/45 text-[11px] text-white/60">⌂</Link>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onTogglePlay();
        }}
        title={playing ? "Stop" : "Play"}
        className={`h-8 w-12 shrink-0 rounded-md border font-mono text-xs font-black ${playing ? "border-red-300/50 bg-red-400 text-black" : "border-green-300/50 bg-green-300 text-black"}`}
      >
        {playing ? "STOP" : "PLAY"}
      </button>
      <button type="button" disabled={!canUndo} onClick={onUndo} title="Undo" className="h-8 w-8 rounded-md border border-white/10 bg-black/35 text-[10px] font-black text-white/60 disabled:opacity-25">↶</button>
      <button type="button" disabled={!canRedo} onClick={onRedo} title="Redo" className="h-8 w-8 rounded-md border border-white/10 bg-black/35 text-[10px] font-black text-white/60 disabled:opacity-25">↷</button>

      <div className="grid h-8 w-20 shrink-0 place-items-center rounded-md border border-white/10 bg-black/50 font-mono text-xs font-black text-cyan-100">{bpm} BPM</div>
      <div className="flex h-8 shrink-0 items-center rounded-md border border-white/10 bg-black/40 px-1">
        <button type="button" onClick={() => onChangeBpm(-1)} className="h-6 w-6 rounded bg-white/5 text-white/70">-</button>
        <button type="button" onClick={() => onChangeBpm(1)} className="h-6 w-6 rounded bg-white/5 text-white/70">+</button>
      </div>

      <div className="mx-1 min-w-[160px] flex-1">
        <div className="mb-1 flex items-center justify-between font-mono text-[8px] uppercase tracking-[0.18em] text-white/32">
          <span>Timeline</span>
          <span>{Math.round(transportPercent)}%</span>
        </div>
        <div className="h-2 rounded-sm border border-black/80 bg-black/70 p-px" aria-hidden="true">
          <div className="h-full rounded-[2px] bg-cyan-300 transition-[width] duration-75" style={{ width: `${transportPercent}%` }} />
        </div>
      </div>

      {syncProblem && (
        <span className="hidden rounded-md border border-yellow-300/35 bg-yellow-300/10 px-2 py-1 font-mono text-[9px] font-black uppercase tracking-widest text-yellow-100 lg:inline-flex">
          Sync {realtimeRevision}
        </span>
      )}

      <Link href="/studio/beat-machine" title="Beat Machine" className="hidden h-8 rounded-md border border-white/10 bg-black/35 px-2 py-2 text-[9px] font-black uppercase tracking-widest text-white/60 md:block">Beat</Link>
      <Link href="/studio/export" title="Export" className="hidden h-8 rounded-md border border-white/10 bg-black/35 px-2 py-2 text-[9px] font-black uppercase tracking-widest text-white/60 lg:block">Export</Link>

      <StudioRecoveryStatus status={recoveryStatus as never} lastSavedAt={lastSavedAt} canRestore={canRestore} onSave={onSave} onRestore={onRestore} />
    </header>
  );
}

export default memo(StudioTransportBar);
