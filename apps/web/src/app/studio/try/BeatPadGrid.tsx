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
    <div className="grid grid-cols-2 gap-2 self-start rounded-xl border border-white/10 bg-[#071015] p-3">
      {pads.map((pad) => (
        <button
          key={pad.label}
          onClick={() => onFirePad(pad.kind, pad.label)}
          title={pad.soundName ? `${pad.label}: ${pad.soundName}` : pad.label}
          className={`h-20 rounded-lg border px-2 text-[10px] font-black uppercase transition ${activePad === pad.label ? "scale-95" : ""}`}
          style={{ background: pad.color, borderColor: pad.color, color: "#061014" }}
        >
          <span className="block">{pad.label}</span>
          {pad.soundName ? <span className="mt-1 block truncate text-[8px] opacity-75">{pad.soundName}</span> : null}
        </button>
      ))}
    </div>
  );
}

export default memo(BeatPadGrid);
