"use client";

import { useEffect, useRef, useState } from "react";
import {
  scheduleDrumHit,
  type DrumKind,
  type DrumKitId,
} from "./beatMachine";

interface Props {
  /** A live AudioContext from the parent (re-used so we share latency
   *  config and avoid extra contexts on iOS). */
  getCtx: () => AudioContext;
  bpm: number;
  kit?: DrumKitId;
}

interface Lane {
  kind: DrumKind;
  label: string;
  color: string;
}

// Lane catalog ordered by priority. We slice this based on the viewport
// width (#26): tiny phones get the 4 essentials, comfortable phones get
// 6, and tablets get the full 8-lane kit. Order is preserved so users
// who grow into the bigger grid don't have their existing pattern
// reshuffled when the count expands.
const ALL_LANES: Lane[] = [
  { kind: "kick", label: "Kick", color: "bg-rose-500/70" },
  { kind: "snare", label: "Snare", color: "bg-amber-400/70" },
  { kind: "hat", label: "Hat", color: "bg-cyan-400/70" },
  { kind: "bass808", label: "808", color: "bg-fuchsia-500/70" },
  { kind: "clap", label: "Clap", color: "bg-violet-400/70" },
  { kind: "openHat", label: "OHat", color: "bg-sky-400/70" },
  { kind: "perc", label: "Perc", color: "bg-emerald-400/70" },
  { kind: "crash", label: "Crash", color: "bg-yellow-300/70" },
];

function lanesForViewport(width: number): Lane[] {
  if (width < 500) return ALL_LANES.slice(0, 4);
  if (width < 800) return ALL_LANES.slice(0, 6);
  return ALL_LANES;
}

const STEPS = 8;

type Pattern = Record<DrumKind, boolean[]>;

function emptyPattern(): Pattern {
  return {
    kick: new Array(STEPS).fill(false),
    snare: new Array(STEPS).fill(false),
    hat: new Array(STEPS).fill(false),
    bass808: new Array(STEPS).fill(false),
    clap: new Array(STEPS).fill(false),
    openHat: new Array(STEPS).fill(false),
    perc: new Array(STEPS).fill(false),
    crash: new Array(STEPS).fill(false),
  };
}

/** Mobile companion to BeatMachineGrid. 4 lanes × 8 steps, with a built-in
 *  scheduler so PhoneStudio doesn't need to spin up the full DawEngine. */
export default function MobileBeatGrid({ getCtx, bpm, kit = "trap" }: Props) {
  const [pattern, setPattern] = useState<Pattern>(() => emptyPattern());
  const [playing, setPlaying] = useState(false);
  const [activeStep, setActiveStep] = useState(-1);
  // Viewport-driven lane count (#26). On window resize / orientation
  // flip we recompute the visible set so a user rotating their phone
  // to landscape sees the extra lanes immediately.
  const [lanes, setLanes] = useState<Lane[]>(() =>
    typeof window === "undefined"
      ? ALL_LANES.slice(0, 4)
      : lanesForViewport(window.innerWidth),
  );
  useEffect(() => {
    function onResize() {
      setLanes(lanesForViewport(window.innerWidth));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const stepIntervalRef = useRef<number | null>(null);
  // Use a ref for pattern so the interval callback always reads the latest
  // toggles without re-creating the interval each render.
  const patternRef = useRef(pattern);
  patternRef.current = pattern;
  // Lanes ref so the playback interval reads the current viewport-driven
  // lane set without having to restart the timer when the user rotates
  // mid-loop (#26).
  const lanesRef = useRef(lanes);
  lanesRef.current = lanes;
  const stepRef = useRef(0);

  function toggleStep(lane: DrumKind, step: number) {
    setPattern((prev) => {
      const next = { ...prev, [lane]: [...prev[lane]] };
      next[lane][step] = !next[lane][step];
      return next;
    });
  }

  function startPlayback() {
    if (playing) return;
    const ctx = getCtx();
    if (ctx.state === "suspended") void ctx.resume();
    stepRef.current = 0;
    setActiveStep(0);
    setPlaying(true);
    // 1/8 step = 30000 / bpm. With STEPS=8 we cover one bar at 4/4.
    const stepMs = 30000 / Math.max(40, Math.min(240, bpm));
    stepIntervalRef.current = window.setInterval(() => {
      const step = stepRef.current;
      const live = patternRef.current;
      const dest = ctx.destination;
      for (const lane of lanesRef.current) {
        if (live[lane.kind][step]) {
          scheduleDrumHit(ctx, dest, lane.kind, {
            when: ctx.currentTime + 0.005,
            kit,
          });
        }
      }
      setActiveStep(step);
      stepRef.current = (step + 1) % STEPS;
    }, stepMs);
  }

  function stopPlayback() {
    if (stepIntervalRef.current !== null) {
      window.clearInterval(stepIntervalRef.current);
      stepIntervalRef.current = null;
    }
    setPlaying(false);
    setActiveStep(-1);
  }

  useEffect(() => {
    return () => {
      if (stepIntervalRef.current !== null) {
        window.clearInterval(stepIntervalRef.current);
      }
    };
  }, []);

  function clear() {
    stopPlayback();
    setPattern(emptyPattern());
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-black/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-white/60">
          Beat grid · {STEPS} steps
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={clear}
            className="rounded-md border border-white/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/65 hover:bg-white/10 transition"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => (playing ? stopPlayback() : startPlayback())}
            className={`rounded-md px-3 py-1 text-[11px] font-black uppercase tracking-widest transition ${
              playing
                ? "bg-white text-black"
                : "bg-cyan-500 text-black hover:bg-cyan-400"
            }`}
          >
            {playing ? "■" : "▶"}
          </button>
        </div>
      </div>

      <div className="space-y-1">
        {lanes.map((lane) => (
          <div key={lane.kind} className="flex items-center gap-1.5">
            <span className="w-12 shrink-0 text-[10px] font-black uppercase tracking-widest text-white/55">
              {lane.label}
            </span>
            <div className="flex flex-1 gap-1">
              {pattern[lane.kind].map((on, step) => {
                const isActive = step === activeStep;
                return (
                  <button
                    key={step}
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      toggleStep(lane.kind, step);
                    }}
                    aria-label={`${lane.label} step ${step + 1} ${on ? "on" : "off"}`}
                    className={`h-9 flex-1 rounded-md transition ${
                      on
                        ? `${lane.color} shadow-inner shadow-black/40`
                        : "bg-white/5 hover:bg-white/10"
                    } ${isActive ? "ring-2 ring-white/60" : ""}`}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
