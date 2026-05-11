"use client";

import { useState } from "react";
import type { DawEngine } from "./dawEngine";

// Tempo map editor: list of {atSec, bpm} points the transport
// interpolates between. Empty list → the project runs at a single
// static BPM. Most users won't touch this; sound designers + film
// composers will.

type Props = {
  engine: DawEngine;
  tempoMap: Array<{ atSec: number; bpm: number }>;
  staticBpm: number;
};

export default function TempoMapEditor({ engine, tempoMap, staticBpm }: Props) {
  const [open, setOpen] = useState(false);
  const [newAt, setNewAt] = useState("0");
  const [newBpm, setNewBpm] = useState(String(staticBpm));

  function addPoint() {
    const atSec = parseFloat(newAt);
    const bpm = parseFloat(newBpm);
    if (!Number.isFinite(atSec) || !Number.isFinite(bpm)) return;
    const next = [...tempoMap, { atSec, bpm }];
    engine.setTempoMap(next);
    setNewAt("0");
    setNewBpm(String(staticBpm));
  }

  function removePoint(idx: number) {
    const next = tempoMap.slice();
    next.splice(idx, 1);
    engine.setTempoMap(next);
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-black/40 p-3 text-[11px]">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.28em] text-amber-200">
            Tempo map
          </span>
          <span className="text-[10px] uppercase tracking-widest text-white/55">
            {tempoMap.length === 0
              ? `Static ${staticBpm.toFixed(0)} BPM`
              : `${tempoMap.length} point${tempoMap.length === 1 ? "" : "s"} — playhead-aware`}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider hover:bg-white/10"
          aria-expanded={open ? "true" : "false"}
        >
          {open ? "Hide" : "Edit"}
        </button>
      </header>

      {open && (
        <div className="mt-2">
          {tempoMap.length === 0 ? (
            <p className="rounded-md border border-dashed border-white/15 bg-white/[0.02] p-3 text-center text-[11px] text-white/55">
              No tempo changes. Add a point below to start ramping BPM
              within the project — e.g. 80 BPM at 0 s and 140 BPM at 16 s
              gives a half-time intro accelerating into the drop.
            </p>
          ) : (
            <ul className="space-y-1">
              {tempoMap.map((p, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1"
                >
                  <span className="flex-1 text-[11px] text-white/75">
                    @{p.atSec.toFixed(2)}s → <strong>{p.bpm.toFixed(0)} BPM</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => removePoint(i)}
                    className="rounded border border-red-400/30 px-1.5 text-[10px] text-red-300 hover:bg-red-500/15"
                    aria-label={`Remove tempo point at ${p.atSec.toFixed(2)} seconds`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex items-center gap-2">
            <label className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-white/55">
              At
              <input
                type="number"
                value={newAt}
                onChange={(e) => setNewAt(e.target.value)}
                step={0.5}
                min={0}
                className="w-16 rounded-md border border-white/15 bg-black/30 px-1 py-0.5 text-right text-[11px]"
                aria-label="Tempo point time in seconds"
              />
              <span className="text-white/45">s</span>
            </label>
            <label className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-white/55">
              BPM
              <input
                type="number"
                value={newBpm}
                onChange={(e) => setNewBpm(e.target.value)}
                step={1}
                min={40}
                max={220}
                className="w-16 rounded-md border border-white/15 bg-black/30 px-1 py-0.5 text-right text-[11px]"
                aria-label="Tempo point BPM"
              />
            </label>
            <button
              type="button"
              onClick={addPoint}
              className="ml-auto rounded-md bg-amber-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-black hover:bg-amber-300"
            >
              Add point
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
