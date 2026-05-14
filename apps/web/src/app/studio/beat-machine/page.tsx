"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { scheduleDrumHit, type DrumKind, type DrumKitId } from "@/components/daw/beatMachine";
import { useStudioMidiBridge } from "../try/useStudioMidiBridge";

type BeatTrackKind = "drum" | "bass" | "melody" | "fx";
type BeatTrack = { id: string; name: string; kind: BeatTrackKind; color: string; level: number; pan: number; muted: boolean; pattern: boolean[] };

const DEFAULT_KIT: DrumKitId = "trap";
const SESSION_ID = "ems-beat-machine-session";
const COLORS = ["#17fff4", "#ff34df", "#f6d63d", "#42ff56", "#a855ff", "#ff7a2f", "#23d4ff", "#ff4f8b"];
const STEPS = Array.from({ length: 16 }, (_, index) => index + 1);
const PADS: { label: string; kind: DrumKind; color: string; hotkey: string }[] = [
  { label: "Kick", kind: "kick", color: "#17fff4", hotkey: "1" },
  { label: "Snare", kind: "snare", color: "#ff34df", hotkey: "2" },
  { label: "Clap", kind: "clap", color: "#f6d63d", hotkey: "3" },
  { label: "Hat", kind: "hat", color: "#42ff56", hotkey: "4" },
  { label: "Open Hat", kind: "openHat", color: "#a855ff", hotkey: "5" },
  { label: "Perc", kind: "perc", color: "#ff7a2f", hotkey: "6" },
  { label: "808", kind: "bass808", color: "#23d4ff", hotkey: "7" },
  { label: "Crash", kind: "crash", color: "#ff4f8b", hotkey: "8" },
];
const INITIAL_TRACKS: BeatTrack[] = [
  { id: "kick", name: "Kick", kind: "drum", color: "#17fff4", level: 88, pan: 0, muted: false, pattern: STEPS.map((step) => [1, 5, 9, 13].includes(step)) },
  { id: "snare", name: "Snare / Clap", kind: "drum", color: "#ff34df", level: 76, pan: 0, muted: false, pattern: STEPS.map((step) => [5, 13].includes(step)) },
  { id: "hat", name: "Hi-Hats", kind: "drum", color: "#42ff56", level: 64, pan: 8, muted: false, pattern: STEPS.map((step) => step % 2 === 1) },
  { id: "bass", name: "808 Bass", kind: "bass", color: "#f6d63d", level: 82, pan: -4, muted: false, pattern: STEPS.map((step) => [1, 4, 9, 12, 15].includes(step)) },
  { id: "perc", name: "Perc Fill", kind: "fx", color: "#ff7a2f", level: 58, pan: 14, muted: false, pattern: STEPS.map((step) => [7, 11, 16].includes(step)) },
];

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  const tag = el?.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || Boolean(el?.isContentEditable);
}

export default function BeatMachinePage() {
  const [playing, setPlaying] = useState(false);
  const [bpm, setBpm] = useState(92);
  const [swing, setSwing] = useState(18);
  const [activePad, setActivePad] = useState<string | null>(null);
  const [selectedTrack, setSelectedTrack] = useState("kick");
  const [tracks, setTracks] = useState<BeatTrack[]>(INITIAL_TRACKS);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const midi = useStudioMidiBridge(SESSION_ID);
  const selected = useMemo(() => tracks.find((track) => track.id === selectedTrack) ?? tracks[0], [selectedTrack, tracks]);

  function getCtx() {
    if (ctxRef.current && ctxRef.current.state !== "closed") return ctxRef.current;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor({ latencyHint: "interactive", sampleRate: 48000 });
    const gain = ctx.createGain();
    gain.gain.value = 0.86;
    gain.connect(ctx.destination);
    ctxRef.current = ctx;
    masterRef.current = gain;
    return ctx;
  }

  function firePad(kind: DrumKind, label: string) {
    const ctx = getCtx();
    if (ctx.state === "suspended") void ctx.resume();
    scheduleDrumHit(ctx, masterRef.current ?? ctx.destination, kind, { kit: DEFAULT_KIT, when: ctx.currentTime, velocity: 0.92 });
    setActivePad(label);
    window.setTimeout(() => setActivePad(null), 140);
  }

  function toggleStep(trackId: string, stepIndex: number) {
    setTracks((current) => current.map((track) => track.id === trackId ? { ...track, pattern: track.pattern.map((step, index) => index === stepIndex ? !step : step) } : track));
  }

  function updateTrack(trackId: string, patch: Partial<BeatTrack>) {
    setTracks((current) => current.map((track) => track.id === trackId ? { ...track, ...patch } : track));
  }

  function addTrack(kind: BeatTrackKind) {
    const index = tracks.length + 1;
    const track: BeatTrack = {
      id: `beat-track-${Date.now()}`,
      name: kind === "bass" ? `808 ${index}` : kind === "melody" ? `Melody ${index}` : kind === "fx" ? `FX ${index}` : `Drum ${index}`,
      kind,
      color: COLORS[index % COLORS.length],
      level: 66,
      pan: 0,
      muted: false,
      pattern: STEPS.map((step) => kind === "drum" ? step % 4 === 1 : step === 1 || step === 9),
    };
    setTracks((current) => [...current, track]);
    setSelectedTrack(track.id);
  }

  return (
    <main id="main-content" className="min-h-screen overflow-y-auto bg-[#05070a] pb-24 text-white">
      <div className="fixed inset-0 -z-10 opacity-80 [background:radial-gradient(circle_at_18%_12%,rgba(23,255,244,.18),transparent_30%),radial-gradient(circle_at_88%_20%,rgba(255,52,223,.15),transparent_28%),linear-gradient(135deg,#05070a,#10151a_45%,#050609)]" />
      <div className="mx-auto max-w-[1800px] px-4 py-4 sm:px-6 lg:px-8">
        <header className="sticky top-0 z-30 mb-4 rounded-2xl border border-green-300/20 bg-[#080d10]/95 p-3 shadow-[0_0_60px_rgba(23,255,244,.14)] backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/studio/try" className="rounded-xl border border-cyan-300/35 bg-cyan-300/10 px-4 py-3 text-xs font-black uppercase tracking-widest text-cyan-100">← Studio</Link>
            <div className="mr-auto">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-green-200/70">Dedicated page</p>
              <h1 className="text-2xl font-black uppercase tracking-wider sm:text-4xl">Beat Machine</h1>
            </div>
            <button onClick={() => setPlaying((value) => !value)} className={`rounded-full border px-5 py-3 text-sm font-black uppercase tracking-widest ${playing ? "border-pink-300 bg-pink-400/20 text-pink-100" : "border-green-300 bg-green-300/15 text-green-100"}`}>{playing ? "Stop" : "Play"}</button>
            <div className="flex items-center rounded-full border border-white/10 bg-black/45 px-2 py-1">
              <button onClick={() => setBpm((value) => Math.max(60, value - 1))} className="h-8 w-8 rounded-full bg-white/5 text-lg">-</button>
              <span className="w-16 text-center font-mono text-lg font-black text-cyan-100">{bpm}</span>
              <button onClick={() => setBpm((value) => Math.min(180, value + 1))} className="h-8 w-8 rounded-full bg-white/5 text-lg">+</button>
            </div>
            <button onClick={midi.connect} className="rounded-xl border border-green-300/35 bg-green-300/10 px-4 py-3 text-xs font-black uppercase tracking-widest text-green-100">MIDI {midi.status}</button>
          </div>
          {midi.lastEvent && <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-white/45">Last MIDI: {midi.lastEvent}</p>}
        </header>

        <section className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-green-300/25 bg-black/45 p-4 shadow-[0_0_45px_rgba(66,255,86,.08)]">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-green-200/70">Performance pads</p>
                  <h2 className="text-xl font-black uppercase">Trap Kit</h2>
                </div>
                <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-widest text-white/45">Keys 1-8</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2">
                {PADS.map((pad) => (
                  <button key={pad.label} onClick={() => firePad(pad.kind, pad.label)} className={`h-24 rounded-2xl border text-left transition ${activePad === pad.label ? "scale-95" : "hover:scale-[.98]"}`} style={{ background: pad.color, borderColor: pad.color, color: "#061014", boxShadow: activePad === pad.label ? `0 0 26px ${pad.color}` : undefined }}>
                    <span className="block px-4 text-2xl font-black uppercase">{pad.label}</span>
                    <span className="block px-4 text-xs font-black uppercase opacity-70">Hotkey {pad.hotkey}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/45 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200/70">Groove control</p>
              <div className="mt-3 grid gap-4">
                <label className="block"><span className="text-xs font-black uppercase text-white/50">Swing {swing}%</span><input type="range" min="0" max="60" value={swing} onChange={(event) => setSwing(Number(event.target.value))} className="mt-2 w-full accent-green-300" /></label>
                <label className="block"><span className="text-xs font-black uppercase text-white/50">Selected level {selected.level}%</span><input type="range" min="0" max="100" value={selected.level} onChange={(event) => updateTrack(selected.id, { level: Number(event.target.value) })} className="mt-2 w-full accent-cyan-300" /></label>
                <label className="block"><span className="text-xs font-black uppercase text-white/50">Selected pan {selected.pan}</span><input type="range" min="-50" max="50" value={selected.pan} onChange={(event) => updateTrack(selected.id, { pan: Number(event.target.value) })} className="mt-2 w-full accent-pink-400" /></label>
              </div>
            </div>
          </div>

          <div className="space-y-4 min-w-0">
            <section className="rounded-2xl border border-cyan-300/20 bg-[#071015]/90 p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200/70">16-step sequencer</p>
                  <h2 className="text-2xl font-black uppercase">Pattern A</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => addTrack("drum")} className="rounded-lg border border-cyan-300/35 px-3 py-2 text-xs font-black uppercase text-cyan-100">+ Drum</button>
                  <button onClick={() => addTrack("bass")} className="rounded-lg border border-yellow-300/35 px-3 py-2 text-xs font-black uppercase text-yellow-100">+ 808</button>
                  <button onClick={() => addTrack("melody")} className="rounded-lg border border-green-300/35 px-3 py-2 text-xs font-black uppercase text-green-100">+ Melody</button>
                  <button onClick={() => addTrack("fx")} className="rounded-lg border border-pink-300/35 px-3 py-2 text-xs font-black uppercase text-pink-100">+ FX</button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/45 p-3">
                <div className="min-w-[980px] space-y-2">
                  <div className="grid grid-cols-[160px_repeat(16,minmax(42px,1fr))] gap-2 text-center text-[10px] font-black uppercase tracking-widest text-white/35">
                    <span className="text-left">Track</span>{STEPS.map((step) => <span key={step}>{step}</span>)}
                  </div>
                  {tracks.map((track) => (
                    <div key={track.id} className="grid grid-cols-[160px_repeat(16,minmax(42px,1fr))] gap-2">
                      <button onClick={() => setSelectedTrack(track.id)} className={`rounded-lg border px-3 py-2 text-left text-xs font-black uppercase ${selectedTrack === track.id ? "border-green-300/70 bg-green-300/10" : "border-white/10 bg-white/[.03]"}`} style={{ color: track.color }}>{track.name}</button>
                      {track.pattern.map((enabled, index) => <button key={`${track.id}-${index}`} onClick={() => toggleStep(track.id, index)} className={`h-10 rounded-lg border transition ${enabled ? "scale-95" : "hover:bg-white/10"}`} style={{ borderColor: enabled ? track.color : "rgba(255,255,255,.12)", background: enabled ? track.color : "rgba(255,255,255,.035)", boxShadow: enabled ? `0 0 14px ${track.color}55` : undefined }} aria-label={`${track.name} step ${index + 1}`} />)}
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/45 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-yellow-200/70">Track mixer</p>
                <div className="mt-3 grid gap-3">
                  {tracks.map((track) => <div key={track.id} className="rounded-xl border border-white/10 bg-[#071015] p-3"><div className="flex items-center justify-between gap-3"><button onClick={() => setSelectedTrack(track.id)} className="font-black uppercase" style={{ color: track.color }}>{track.name}</button><button onClick={() => updateTrack(track.id, { muted: !track.muted })} className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase ${track.muted ? "border-pink-300 bg-pink-300/20 text-pink-100" : "border-white/10 text-white/45"}`}>{track.muted ? "Muted" : "Live"}</button></div><input aria-label={`${track.name} level`} type="range" min="0" max="100" value={track.level} onChange={(event) => updateTrack(track.id, { level: Number(event.target.value) })} className="mt-3 w-full accent-cyan-300" /></div>)}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/45 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-pink-200/70">Pattern tools</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {["Duplicate Pattern", "Humanize Hats", "Quantize", "Half-Time", "Save Kit", "Export Loop", "Clear Track", "Random Fill"].map((label) => <button key={label} className="rounded-xl border border-white/10 bg-white/[.035] p-4 text-left text-xs font-black uppercase tracking-widest text-white/65 hover:border-green-300/40 hover:text-green-100">{label}</button>)}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-black/45 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-green-200/70">Arrangement scratchpad</p>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                {["Intro", "Verse", "Hook", "Bridge", "Drop", "Breakdown", "Outro", "Alt Hook"].map((section, index) => <div key={section} className="min-h-28 rounded-xl border border-white/10 bg-[#071015] p-3"><div className="font-black uppercase" style={{ color: COLORS[index % COLORS.length] }}>{section}</div><p className="mt-2 text-xs text-white/45">Drag patterns here when arranger wiring lands. This dedicated page keeps the full beat workflow visible.</p></div>)}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
