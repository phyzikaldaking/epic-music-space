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
          className={`h-20 rounded-lg border text-[10px] font-black uppercase transition ${activePad === pad.label ? "scale-95" : ""}`}
          style={{ background: pad.color, borderColor: pad.color, color: "#061014" }}
        >
          {pad.label}
        </button>
      ))}
    </div>
  );
}

export default memo(BeatPadGrid);
