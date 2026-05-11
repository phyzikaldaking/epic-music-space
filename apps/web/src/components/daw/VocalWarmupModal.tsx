"use client";

import { useEffect, useRef, useState } from "react";

// Vocal warmup + pitch reference. Before tracking vocals, producers
// hit play on a tonic drone in the song's key and run through a few
// minutes of scales. We synthesize everything with two oscillators
// (triangle for the pitch, sine for the harmonic shimmer) so there's
// no asset pipeline.

type Props = {
  open: boolean;
  /** Project key as a note name ("C", "C#", "Db", … "B"). Falls back
   *  to C if the workspace doesn't know yet. */
  projectKey?: string | null;
  onClose: () => void;
};

const NOTE_NAMES = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];
const ENHARMONIC: Record<string, string> = {
  Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#",
};

// MIDI note 60 = middle C. Build a freq from semitone offset.
function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function keyToMidi(name: string, octave = 4): number {
  const n = ENHARMONIC[name] ?? name;
  const idx = NOTE_NAMES.indexOf(n);
  // Middle C = MIDI 60. C4 = 60, C5 = 72.
  return 12 * (octave + 1) + (idx >= 0 ? idx : 0);
}

// Two-oscillator pad: triangle on the root, sine an octave up at -12 dB.
// Filtered to roll off harshness; sounds like a soft synth pad.
function makeDroneVoice(ctx: AudioContext, midi: number): {
  stop: () => void;
} {
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(ctx.destination);

  const filt = ctx.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.value = 2400;
  filt.connect(out);

  const osc1 = ctx.createOscillator();
  osc1.type = "triangle";
  osc1.frequency.value = midiToFreq(midi);
  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = midiToFreq(midi + 12);

  const g1 = ctx.createGain();
  g1.gain.value = 0.18;
  const g2 = ctx.createGain();
  g2.gain.value = 0.06;

  osc1.connect(g1).connect(filt);
  osc2.connect(g2).connect(filt);

  osc1.start();
  osc2.start();
  out.gain.linearRampToValueAtTime(0.6, ctx.currentTime + 0.25);

  return {
    stop: () => {
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(out.gain.value, t);
      out.gain.linearRampToValueAtTime(0, t + 0.18);
      try {
        osc1.stop(t + 0.25);
        osc2.stop(t + 0.25);
      } catch {
        // already stopped — fine
      }
    },
  };
}

export default function VocalWarmupModal({ open, projectKey, onClose }: Props) {
  const ctxRef = useRef<AudioContext | null>(null);
  const droneRef = useRef<{ stop: () => void } | null>(null);
  const [drone, setDrone] = useState(false);
  const [key, setKey] = useState<string>(projectKey ?? "C");
  const [scaleStep, setScaleStep] = useState<number | null>(null);

  useEffect(() => {
    if (projectKey) setKey(projectKey);
  }, [projectKey]);

  useEffect(() => {
    if (!open) {
      droneRef.current?.stop();
      droneRef.current = null;
      setDrone(false);
      setScaleStep(null);
    }
  }, [open]);

  function ensureCtx(): AudioContext {
    if (!ctxRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      ctxRef.current = new Ctor!();
    }
    return ctxRef.current!;
  }

  function toggleDrone() {
    if (drone) {
      droneRef.current?.stop();
      droneRef.current = null;
      setDrone(false);
      return;
    }
    const ctx = ensureCtx();
    if (ctx.state === "suspended") void ctx.resume();
    droneRef.current = makeDroneVoice(ctx, keyToMidi(key, 3));
    setDrone(true);
  }

  // Play a 5-note ascending then descending scale from the tonic.
  // We use the major scale (W-W-H-W-W-W-H) because it's universally
  // recognised and works as a warm-up regardless of song key.
  async function playScale() {
    const ctx = ensureCtx();
    if (ctx.state === "suspended") await ctx.resume();
    const tonic = keyToMidi(key, 4);
    const major = [0, 2, 4, 5, 7, 5, 4, 2, 0];
    const beat = 0.5; // 120 BPM-ish
    for (let i = 0; i < major.length; i++) {
      setScaleStep(i);
      const f = midiToFreq(tonic + major[i]);
      const start = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0;
      osc.connect(g).connect(ctx.destination);
      g.gain.linearRampToValueAtTime(0.25, start + 0.03);
      g.gain.linearRampToValueAtTime(0, start + beat * 0.9);
      osc.start(start);
      osc.stop(start + beat);
      await new Promise<void>((r) => window.setTimeout(r, beat * 1000));
    }
    setScaleStep(null);
  }

  // Lip-trill pitch slide — a continuous slide from the tonic up an
  // octave and back. Mimics the classic vocal warmup exercise.
  async function playSlide() {
    const ctx = ensureCtx();
    if (ctx.state === "suspended") await ctx.resume();
    const tonic = keyToMidi(key, 4);
    const start = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    const g = ctx.createGain();
    g.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;
    osc.connect(lp).connect(g).connect(ctx.destination);
    osc.frequency.setValueAtTime(midiToFreq(tonic), start);
    osc.frequency.linearRampToValueAtTime(midiToFreq(tonic + 12), start + 1.2);
    osc.frequency.linearRampToValueAtTime(midiToFreq(tonic), start + 2.4);
    g.gain.linearRampToValueAtTime(0.2, start + 0.05);
    g.gain.linearRampToValueAtTime(0, start + 2.4);
    osc.start(start);
    osc.stop(start + 2.5);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[170] grid place-items-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-pink-400/50 bg-zinc-950 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.32em] text-pink-300">
              Warm up
            </div>
            <h2 className="mt-1 font-display text-xl uppercase tracking-wide">
              Vocal prep · key of {key}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-white/20 px-3 py-1 text-[10px] uppercase tracking-widest hover:bg-white/10"
          >
            Close
          </button>
        </div>

        {/* Key picker */}
        <div className="mb-4 flex flex-wrap gap-1">
          {NOTE_NAMES.map((n) => (
            <button
              key={n}
              onClick={() => {
                if (drone) {
                  droneRef.current?.stop();
                  droneRef.current = null;
                  setDrone(false);
                }
                setKey(n);
              }}
              className={`rounded-md px-2 py-1 text-[10px] font-bold ${
                key === n
                  ? "bg-pink-400/30 text-pink-100"
                  : "border border-white/15 text-white/65 hover:bg-white/10"
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        {/* Drone toggle */}
        <button
          onClick={toggleDrone}
          className={`mb-2 w-full rounded-xl px-4 py-3 text-left transition ${
            drone
              ? "bg-pink-500/25 border border-pink-400 shadow-[0_0_24px_rgba(236,72,153,0.4)]"
              : "border border-white/15 bg-white/[0.03] hover:bg-white/[0.06]"
          }`}
        >
          <div className="text-[10px] font-black uppercase tracking-[0.28em] text-pink-200">
            {drone ? "🟣 Drone playing" : "Tonic drone"}
          </div>
          <div className="mt-1 text-sm">
            Sustained {key} pad — sing along to lock your pitch in.
          </div>
        </button>

        {/* Scale + slide */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => void playScale()}
            className="rounded-xl border border-white/15 bg-white/[0.04] px-3 py-3 text-left hover:bg-white/[0.08]"
          >
            <div className="text-[10px] font-black uppercase tracking-[0.28em] text-pink-200">
              Major scale
            </div>
            <div className="mt-1 text-sm font-bold">
              {scaleStep !== null ? `Step ${scaleStep + 1}/9` : "Up + down"}
            </div>
          </button>
          <button
            onClick={() => void playSlide()}
            className="rounded-xl border border-white/15 bg-white/[0.04] px-3 py-3 text-left hover:bg-white/[0.08]"
          >
            <div className="text-[10px] font-black uppercase tracking-[0.28em] text-pink-200">
              Lip-trill slide
            </div>
            <div className="mt-1 text-sm font-bold">Octave glide</div>
          </button>
        </div>

        <p className="mt-4 text-[10px] uppercase tracking-widest text-white/40">
          Free-up the cords · 60-90s before tracking
        </p>
      </div>
    </div>
  );
}
