"use client";

import { memo } from "react";
import type { DrumKind } from "@/components/daw/beatMachine";
import type { StudioPad } from "./studioWorkstationTypes";

type Props = {
  pads: StudioPad[];
  activePad: string | null;
  onFirePad: (kind: DrumKind, label: string) => void;
};

function BeatPadGrid({ pads, activePad, onFirePad }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 self-start rounded-[18px] border border-white/10 bg-[linear-gradient(180deg,#071015,#04070a)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.06)]">
      {pads.map((pad) => (
        <button
          key={pad.label}
          onClick={() => onFirePad(pad.kind, pad.label)}
          title={pad.soundName ? `${pad.label}: ${pad.soundName}` : pad.label}
          className={`group relative h-24 overflow-hidden rounded-[14px] border px-2 text-[10px] font-black uppercase transition ${activePad === pad.label ? "scale-[0.97]" : ""}`}
          style={{ background: `linear-gradient(180deg, ${pad.color}, #071015)`, borderColor: `${pad.color}`, color: "#061014" }}
        >
          <span className="absolute inset-x-0 top-0 h-1 opacity-70" style={{ backgroundColor: pad.color }} />
          <span className="block text-[11px] tracking-[0.18em] text-black/80">{pad.label}</span>
          <span className="mt-2 block text-[8px] uppercase tracking-[0.22em] text-black/60">{activePad === pad.label ? "Live" : "Ready"}</span>
          {pad.soundName ? <span className="mt-3 block truncate text-[8px] text-black/75">{pad.soundName}</span> : <span className="mt-3 block text-[8px] text-black/55">Assign sample</span>}
          <span className="absolute bottom-2 right-2 text-[8px] font-black tracking-[0.2em] text-black/70">TRIG</span>
        </button>
      ))}
    </div>
  );
}

export default memo(BeatPadGrid);
