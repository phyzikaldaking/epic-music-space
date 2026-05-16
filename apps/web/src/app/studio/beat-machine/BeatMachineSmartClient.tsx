"use client";

import { useEffect, useMemo, useState } from "react";
import BeatMachineProClient from "./BeatMachineProClient";

type SmartMode = "balanced" | "trap" | "soul" | "cinematic" | "club";

type FrequencyLane = {
  name: string;
  range: string;
  move: string;
  reason: string;
};

const MODE_LANES: Record<SmartMode, FrequencyLane[]> = {
  balanced: [
    { name: "Kick / 808", range: "38-90 Hz", move: "keep mono, tune to root, soft clip peaks", reason: "Locks the low end without muddying the mix." },
    { name: "Snare / Clap", range: "180 Hz / 2-7 kHz", move: "trim low rumble, add transient presence", reason: "Keeps the backbeat sharp and forward." },
    { name: "Hats", range: "7-12 kHz", move: "high-pass, small stereo width", reason: "Adds air without fighting vocals." },
    { name: "Melody", range: "250 Hz-5 kHz", move: "cut mud, leave vocal pocket", reason: "Makes samples musical and usable." },
  ],
  trap: [
    { name: "808", range: "32-72 Hz", move: "mono sub, tune root, saturate harmonics", reason: "Gives phone speakers audible bass harmonics." },
    { name: "Kick", range: "55-110 Hz", move: "short punch, duck 808 transient", reason: "Makes the kick hit without low-end collision." },
    { name: "Snare / Clap", range: "200 Hz / 4-8 kHz", move: "tight body, bright snap", reason: "Cuts through heavy drums." },
    { name: "Hats / Rolls", range: "8-14 kHz", move: "velocity humanize, 1/16-1/32 rolls", reason: "Creates bounce and movement." },
  ],
  soul: [
    { name: "Sample", range: "180 Hz-6 kHz", move: "warm low-mid, gentle top rolloff", reason: "Keeps the sample dusty and musical." },
    { name: "Kick", range: "45-85 Hz", move: "round transient, low saturation", reason: "Feels analog instead of plastic." },
    { name: "Snare", range: "180 Hz-4 kHz", move: "body over snap", reason: "Matches older records and breaks." },
    { name: "Texture", range: "6-10 kHz", move: "light noise/air bed", reason: "Adds vinyl-style glue." },
  ],
  cinematic: [
    { name: "Sub / Impact", range: "28-70 Hz", move: "longer release, mono foundation", reason: "Creates trailer-weight impact." },
    { name: "Percussion", range: "120 Hz-8 kHz", move: "wide room, controlled transient", reason: "Gives size without harshness." },
    { name: "Strings / Brass", range: "200 Hz-7 kHz", move: "wide image, cut masking", reason: "Keeps orchestral layers readable." },
    { name: "FX", range: "80 Hz-14 kHz", move: "automate filters and swells", reason: "Creates motion and scene changes." },
  ],
  club: [
    { name: "Kick", range: "45-100 Hz", move: "hard transient, mono low end", reason: "Translates on large speakers." },
    { name: "Bass", range: "40-120 Hz", move: "sidechain around kick", reason: "Keeps the groove pumping." },
    { name: "Lead", range: "700 Hz-6 kHz", move: "front-center, delay throw", reason: "Makes the hook obvious." },
    { name: "Top Loop", range: "8-16 kHz", move: "wide, controlled brightness", reason: "Adds energy without pain." },
  ],
};

const SMART_ACTIONS = [
  "Pre-warm audio engine before the first pad hit",
  "Use cached decoded sounds when available",
  "Keep pad input on pointer-down, not click-delay",
  "Prefer short fades to prevent pops and clicks",
  "Tune 808s and melodic chops to detected/root key",
  "Keep sub frequencies mono and widen only upper layers",
  "Auto-recommend gain, pan, EQ lane, and role per sound",
  "Detect sample tempo/key/transients before assigning chops",
];

declare global {
  interface Window {
    __EMS_MPC_AUDIO_CONTEXT__?: AudioContext;
    __EMS_MPC_LATENCY_READY__?: boolean;
    __EMS_MPC_SOUND_CACHE__?: unknown;
  }
}

function createWarmupContext() {
  if (typeof window === "undefined") return null;
  if (window.__EMS_MPC_AUDIO_CONTEXT__ && window.__EMS_MPC_AUDIO_CONTEXT__.state !== "closed") return window.__EMS_MPC_AUDIO_CONTEXT__;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor({ latencyHint: "interactive", sampleRate: 48000 });
  window.__EMS_MPC_AUDIO_CONTEXT__ = ctx;
  return ctx;
}

async function warmAudioEngine() {
  if (typeof window === "undefined" || window.__EMS_MPC_LATENCY_READY__) return;
  const ctx = createWarmupContext();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") await ctx.resume();
    const gain = ctx.createGain();
    gain.gain.value = 0.00001;
    gain.connect(ctx.destination);
    const osc = ctx.createOscillator();
    osc.frequency.value = 40;
    osc.connect(gain);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.018);
    window.__EMS_MPC_LATENCY_READY__ = true;
  } catch {
    window.__EMS_MPC_LATENCY_READY__ = false;
  }
}

export default function BeatMachineSmartClient() {
  const [mode, setMode] = useState<SmartMode>("trap");
  const [latencyReady, setLatencyReady] = useState(false);
  const lanes = useMemo(() => MODE_LANES[mode], [mode]);

  useEffect(() => {
    const prewarm = () => {
      void warmAudioEngine().then(() => setLatencyReady(Boolean(window.__EMS_MPC_LATENCY_READY__)));
    };
    document.addEventListener("pointerdown", prewarm, { capture: true, passive: true });
    document.addEventListener("keydown", prewarm, { capture: true });
    document.documentElement.dataset.emsMpcLatency = "armed";
    void fetch("/api/studio/sounds/library?limit=250", { cache: "force-cache" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { window.__EMS_MPC_SOUND_CACHE__ = data; })
      .catch(() => undefined);
    return () => {
      document.removeEventListener("pointerdown", prewarm, true);
      document.removeEventListener("keydown", prewarm, true);
      delete document.documentElement.dataset.emsMpcLatency;
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem("ems-smart-mpc-profile", JSON.stringify({ mode, lanes, updatedAt: new Date().toISOString() }));
  }, [mode, lanes]);

  return <div className="min-h-screen bg-[#030607] text-white">
    <style jsx global>{`
      html[data-ems-mpc-latency="armed"] button,
      html[data-ems-mpc-latency="armed"] [role="button"] {
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
      }
      html[data-ems-mpc-latency="armed"] * {
        scroll-behavior: auto !important;
      }
    `}</style>
    <section className="mx-auto mb-2 max-w-[1900px] px-2 pt-2 sm:px-4">
      <div className="rounded-2xl border border-cyan-300/20 bg-black/55 p-3 shadow-[0_0_28px_rgba(23,255,244,.08)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-200/70">Smart MPC intelligence layer</p>
            <h2 className="text-lg font-black uppercase tracking-wide text-white sm:text-2xl">AI tone, frequency, and latency board</h2>
          </div>
          <span className={`rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-widest ${latencyReady ? "border-green-300/50 bg-green-300/10 text-green-100" : "border-yellow-300/40 bg-yellow-300/10 text-yellow-100"}`}>{latencyReady ? "Low-latency armed" : "Tap any pad to arm audio"}</span>
          <select value={mode} onChange={(event) => setMode(event.target.value as SmartMode)} className="rounded-xl border border-white/10 bg-black px-3 py-2 text-xs font-black uppercase tracking-widest text-cyan-100">
            <option value="trap">Trap</option>
            <option value="balanced">Balanced</option>
            <option value="soul">Soul Sample</option>
            <option value="cinematic">Cinematic</option>
            <option value="club">Club</option>
          </select>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {lanes.map((lane) => <div key={lane.name} className="rounded-xl border border-white/10 bg-white/[.035] p-3">
            <div className="flex items-center justify-between gap-2">
              <b className="text-xs uppercase text-cyan-100">{lane.name}</b>
              <span className="rounded-full border border-white/10 px-2 py-1 text-[9px] uppercase text-white/50">{lane.range}</span>
            </div>
            <p className="mt-2 text-xs font-semibold text-white/75">{lane.move}</p>
            <p className="mt-1 text-[11px] leading-4 text-white/45">{lane.reason}</p>
          </div>)}
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          {SMART_ACTIONS.slice(0, 8).map((action) => <div key={action} className="rounded-lg border border-green-300/15 bg-green-300/[.04] px-3 py-2 text-[10px] font-black uppercase leading-4 tracking-wider text-green-100/80">{action}</div>)}
        </div>
      </div>
    </section>
    <BeatMachineProClient />
  </div>;
}
