"use client";

import { useEffect, useState } from "react";
import {
  startYjsCollab,
  observeBeatSteps,
  readSharedFields,
  getSharedProject,
} from "@/lib/yjsBridge";
import type * as Y from "yjs";

// Live-collab spectator (#G42). Joins the same Yjs room the host is
// editing in and renders a read-only view of: BPM, kit, and beat
// pattern (8 lanes × 16 steps). No audio engine boot, no edit
// affordances — purely a viewer for sharing the room link with a
// friend or collaborator who isn't allowed to write.

const LANES = [
  "kick",
  "snare",
  "clap",
  "hat",
  "openHat",
  "perc",
  "bass808",
  "crash",
] as const;

const LANE_COLORS: Record<string, string> = {
  kick: "bg-red-500",
  snare: "bg-amber-500",
  clap: "bg-violet-400",
  hat: "bg-cyan-400",
  openHat: "bg-sky-400",
  perc: "bg-emerald-500",
  bass808: "bg-pink-500",
  crash: "bg-yellow-400",
};

export default function LiveEditSpectator({ roomId }: { roomId: string }) {
  const [bpm, setBpm] = useState<number | null>(null);
  const [kit, setKit] = useState<string | null>(null);
  const [steps, setSteps] = useState<Record<string, boolean>>({});
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const handle = startYjsCollab(roomId);
    setConnected(true);

    // Initial snapshot. The Yjs sync handshake means data may not be
    // present immediately; we re-read on each map change below.
    const initial = readSharedFields(handle.doc);
    if (typeof initial.bpm === "number") setBpm(initial.bpm);
    if (typeof initial.beatKit === "string") setKit(initial.beatKit);
    if (typeof initial.beatEnabled === "boolean") setEnabled(initial.beatEnabled);
    if (initial.beatSteps) setSteps({ ...initial.beatSteps });

    // Subscribe to top-level Map changes so we re-render when the host
    // toggles bpm / kit / enabled.
    const sharedMap = getSharedProject(handle.doc) as Y.Map<unknown>;
    const onShared = () => {
      const fields = readSharedFields(handle.doc);
      if (typeof fields.bpm === "number") setBpm(fields.bpm);
      if (typeof fields.beatKit === "string") setKit(fields.beatKit);
      if (typeof fields.beatEnabled === "boolean") setEnabled(fields.beatEnabled);
    };
    sharedMap.observe(onShared);

    // Subscribe to beat-step changes via the dedicated helper. The
    // helper emits a list of changed keys + their new states; we merge
    // them into the existing map so unrelated cells stay set.
    const unsubBeatSteps = observeBeatSteps(handle.doc, (changes) => {
      setSteps((prev) => {
        const next = { ...prev };
        for (const c of changes) next[c.key] = c.on;
        return next;
      });
    });

    return () => {
      sharedMap.unobserve(onShared);
      unsubBeatSteps();
      handle.destroy();
      setConnected(false);
    };
  }, [roomId]);

  function stepOn(lane: string, step: number): boolean {
    return Boolean(steps[`${lane}:${step}`]);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.32em] text-cyan-300">
            Live edit · spectator
          </p>
          <h1 className="mt-1 font-display text-2xl uppercase tracking-wide">
            Room {roomId.slice(0, 8)}
          </h1>
          <p className="mt-1 text-xs text-white/55">
            Read-only view of a live producer session. The host&apos;s changes
            appear here in real time.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
          <span className="text-[10px] uppercase tracking-widest text-white/45">
            {connected ? "🟢 Connected" : "⚪ Connecting…"}
          </span>
          <span className="font-mono text-xs text-white/85">
            {bpm ? `${bpm} BPM` : "—"}
          </span>
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white/75">
            {kit ?? "no kit"}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${
              enabled
                ? "bg-emerald-500/25 text-emerald-100"
                : "bg-white/10 text-white/55"
            }`}
          >
            {enabled ? "Playing" : "Idle"}
          </span>
        </div>
      </header>

      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-4">
        <div className="space-y-1.5">
          {LANES.map((lane) => (
            <div key={lane} className="flex items-center gap-2">
              <div
                className={`w-14 shrink-0 text-[11px] font-black uppercase tracking-widest ${
                  LANE_COLORS[lane]?.replace("bg-", "text-") ?? "text-white/70"
                }`}
              >
                {lane}
              </div>
              <div className="flex flex-1 gap-[3px]">
                {Array.from({ length: 16 }, (_, step) => {
                  const on = stepOn(lane, step);
                  const isDownbeat = step % 4 === 0;
                  return (
                    <div
                      key={step}
                      className={`relative h-7 flex-1 overflow-hidden rounded-md border ${
                        on
                          ? `border-transparent ${LANE_COLORS[lane] ?? "bg-white/40"}`
                          : isDownbeat
                            ? "border-white/15 bg-white/[0.04]"
                            : "border-white/10 bg-white/[0.02]"
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-[10px] uppercase tracking-[0.28em] text-white/35">
          Read-only · live from the host&apos;s session
        </p>
      </div>
    </div>
  );
}
