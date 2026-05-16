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
  const realtimeClass = realtimeStatus === "conflict" ? "border-yellow-300/35 text-yellow-100" : realtimeStatus === "error" ? "border-red-300/35 text-red-100" : "border-cyan-300/30 text-cyan-100";

  return (
    <header className="sticky top-1 z-40 flex min-h-[42px] shrink-0 items-center gap-1 rounded-xl border border-white/10 bg-[#10151b]/95 px-2 py-1.5 shadow-[inset_0_0_10px_rgba(255,255,255,.03)] backdrop-blur">
      <Link href="/" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-cyan-300/30 bg-cyan-300/10 text-cyan-200">⌂</Link>
      <div className="hidden rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[9px] uppercase tracking-widest text-white/55 md:block">EMS DAW</div>

      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onTogglePlay();
        }}
        className={`h-8 w-8 shrink-0 rounded-full border text-xs font-black ${playing ? "border-pink-300 bg-pink-500/20 text-pink-100" : "border-cyan-300 bg-cyan-300/15 text-cyan-100"}`}
      >
        {playing ? "■" : "▶"}
      </button>
      <button type="button" disabled={!canUndo} onClick={onUndo} className="hidden h-8 rounded-full border border-white/10 px-2 text-[9px] font-black uppercase tracking-widest text-white/60 disabled:opacity-30 sm:block">Undo</button>
      <button type="button" disabled={!canRedo} onClick={onRedo} className="hidden h-8 rounded-full border border-white/10 px-2 text-[9px] font-black uppercase tracking-widest text-white/60 disabled:opacity-30 sm:block">Redo</button>

      <div className="pointer-events-none mx-1 h-4 min-w-[80px] flex-1 rounded-sm border border-white/10 bg-black/55 p-0.5" aria-hidden="true">
        <div className="h-full rounded-sm bg-cyan-300" style={{ width: `${Math.min(100, Math.max(2, bar / 1.28))}%` }} />
      </div>

      <span className={`hidden h-8 items-center rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-widest lg:flex ${realtimeClass}`}>{realtimeStatus} r{realtimeRevision}</span>
      <Link href="/studio/beat-machine" className="hidden h-8 rounded-full border border-yellow-300/30 px-2 py-2 text-[9px] font-black uppercase tracking-widest text-yellow-100 md:block">Full Beat</Link>
      <Link href="/studio/export" className="hidden h-8 rounded-full border border-green-300/30 px-2 py-2 text-[9px] font-black uppercase tracking-widest text-green-100 lg:block">Export</Link>

      <StudioRecoveryStatus status={recoveryStatus as never} lastSavedAt={lastSavedAt} canRestore={canRestore} onSave={onSave} onRestore={onRestore} />

      <div className="flex h-8 shrink-0 items-center rounded-full border border-white/10 bg-black/40 px-1">
        <button type="button" onClick={() => onChangeBpm(-1)} className="h-6 w-6 rounded-full bg-white/5">-</button>
        <span className="w-10 text-center font-mono text-xs font-black text-cyan-100">{bpm}</span>
        <button type="button" onClick={() => onChangeBpm(1)} className="h-6 w-6 rounded-full bg-white/5">+</button>
      </div>
    </header>
  );
}

export default memo(StudioTransportBar);
