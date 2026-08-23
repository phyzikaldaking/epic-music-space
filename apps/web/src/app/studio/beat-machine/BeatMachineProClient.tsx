"use client";

import { useEffect, useRef, useState } from "react";
import { buildBeatStemRenderPlan, type BeatStemRenderPlan } from "./beatStemPrint";

type Pad = { id: string; label: string; key: string; color: string; freq: number; volume: number; pan: number; muted: boolean; solo: boolean; steps: boolean[] };
type Preset = { name: string; volumes: Record<string, number>; pans: Record<string, number> };

const makeSteps = (on: number[]) => Array.from({ length: 16 }, (_, i) => on.includes(i + 1));
const initialPads: Pad[] = [
  { id: "kick", label: "KICK", key: "1", color: "#20f7ff", freq: 54, volume: 88, pan: 0, muted: false, solo: false, steps: makeSteps([1, 5, 9, 13]) },
  { id: "snare", label: "SNARE", key: "2", color: "#ff31df", freq: 180, volume: 74, pan: 0, muted: false, solo: false, steps: makeSteps([5, 13]) },
  { id: "hat", label: "HAT", key: "3", color: "#a75cff", freq: 6500, volume: 48, pan: 14, muted: false, solo: false, steps: makeSteps([1, 3, 5, 7, 9, 11, 13, 15]) },
  { id: "clap", label: "CLAP", key: "4", color: "#a75cff", freq: 260, volume: 60, pan: -8, muted: false, solo: false, steps: makeSteps([5, 13]) },
  { id: "bass", label: "808", key: "Q", color: "#f2c85b", freq: 42, volume: 82, pan: 0, muted: false, solo: false, steps: makeSteps([1, 4, 9, 12, 15]) },
  { id: "perc", label: "PERC", key: "W", color: "#16e59a", freq: 410, volume: 55, pan: 18, muted: false, solo: false, steps: makeSteps([3, 7, 10, 14]) },
  { id: "vox", label: "VOX", key: "E", color: "#20c8ff", freq: 330, volume: 58, pan: -18, muted: false, solo: false, steps: makeSteps([8, 16]) },
  { id: "fx", label: "FX", key: "R", color: "#ff4f8b", freq: 920, volume: 42, pan: 24, muted: false, solo: false, steps: makeSteps([4, 12]) },
];
const presets: Preset[] = [
  { name: "Trap Knock", volumes: { kick: 94, snare: 72, hat: 52, clap: 50, bass: 92, perc: 54, vox: 44, fx: 34 }, pans: { hat: 8, perc: -18, vox: 16, fx: 28 } },
  { name: "Clean Punch", volumes: { kick: 90, snare: 76, hat: 44, clap: 58, bass: 80, perc: 48, vox: 56, fx: 38 }, pans: { hat: 12, perc: 18, vox: -14, fx: 22 } },
  { name: "Lo-Fi Space", volumes: { kick: 68, snare: 58, hat: 34, clap: 42, bass: 62, perc: 38, vox: 72, fx: 64 }, pans: { hat: 18, perc: -22, vox: -8, fx: 30 } },
];

function cn(...v: Array<string | false | undefined | null>) { return v.filter(Boolean).join(" "); }
function isTypingTarget(target: EventTarget | null) { const el = target as HTMLElement | null; return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)); }
function download(name: string, text: string) { const blob = new Blob([text], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); }

function audioBufferToWav(buffer: AudioBuffer) {
  const channels = buffer.numberOfChannels;
  const bytesPerSample = 2;
  const frameBytes = channels * bytesPerSample;
  const output = new ArrayBuffer(44 + buffer.length * frameBytes);
  const view = new DataView(output);
  const write = (offset: number, value: string) => Array.from(value).forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  write(0, "RIFF"); view.setUint32(4, output.byteLength - 8, true); write(8, "WAVE"); write(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * frameBytes, true);
  view.setUint16(32, frameBytes, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, buffer.length * frameBytes, true);
  let offset = 44;
  for (let frame = 0; frame < buffer.length; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[frame] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }
  return new Blob([output], { type: "audio/wav" });
}

async function renderBeatStem(stem: BeatStemRenderPlan) {
  const sampleRate = 44_100;
  const context = new OfflineAudioContext(2, Math.ceil(stem.durationSec * sampleRate), sampleRate);
  stem.hitTimesSec.forEach((start) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const pan = context.createStereoPanner();
      oscillator.frequency.value = stem.frequency;
      oscillator.type = stem.id === "hat" || stem.id === "fx" ? "square" : stem.id === "bass" || stem.id === "kick" ? "sine" : "triangle";
      pan.pan.value = Math.max(-1, Math.min(1, stem.pan / 50));
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.001, (stem.volume / 100) * 0.25), start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + (stem.id === "bass" ? 0.55 : stem.id === "hat" ? 0.08 : 0.22));
      oscillator.connect(gain).connect(pan).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.7);
  });
  return audioBufferToWav(await context.startRendering());
}

export type PrintedBeatStem = BeatStemRenderPlan & { blob: Blob; name: string; kind: "drum" | "bass" | "vocal" | "fx" };

export default function BeatMachineProClient({ studioMode = false, onPrintToStudio }: { initialView?: string; studioMode?: boolean; onPrintToStudio?: (stems: PrintedBeatStem[]) => Promise<void> | void }) {
  const [pads, setPads] = useState<Pad[]>(initialPads);
  const [selected, setSelected] = useState("kick");
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(0);
  const [bpm, setBpm] = useState(140);
  const [printing, setPrinting] = useState(false);
  const timer = useRef<number | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const activePad = pads.find((pad) => pad.id === selected) ?? pads[0];
  const soloed = pads.some((pad) => pad.solo);

  function context() { audio.current ??= new AudioContext(); return audio.current; }
  function trigger(pad: Pad, velocity = 1) {
    if (pad.muted || (soloed && !pad.solo)) return;
    const ctx = context();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();
    osc.frequency.value = pad.freq;
    osc.type = pad.id === "hat" || pad.id === "fx" ? "square" : pad.id === "bass" || pad.id === "kick" ? "sine" : "triangle";
    pan.pan.value = Math.max(-1, Math.min(1, pad.pan / 50));
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, (pad.volume / 100) * velocity * 0.28), now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (pad.id === "bass" ? 0.55 : pad.id === "hat" ? 0.08 : 0.22));
    osc.connect(gain).connect(pan).connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.7);
  }
  function updatePad(id: string, patch: Partial<Pad>) { setPads((current) => current.map((pad) => pad.id === id ? { ...pad, ...patch } : pad)); }
  function toggleStep(id: string, index: number) { setPads((current) => current.map((pad) => pad.id === id ? { ...pad, steps: pad.steps.map((on, i) => i === index ? !on : on) } : pad)); }
  function stop() { if (timer.current) window.clearInterval(timer.current); timer.current = null; setPlaying(false); setStep(0); }
  function play() {
    if (playing) { stop(); return; }
    void context().resume();
    const interval = Math.max(40, (60 / bpm / 4) * 1000);
    let cursor = 0;
    timer.current = window.setInterval(() => {
      setStep(cursor);
      pads.forEach((pad) => { if (pad.steps[cursor]) trigger(pad, 0.88); });
      cursor = (cursor + 1) % 16;
    }, interval);
    setPlaying(true);
  }
  function randomize() { setPads((current) => current.map((pad) => ({ ...pad, steps: pad.steps.map((_, i) => i === 0 || Math.random() > (pad.id === "hat" ? 0.45 : 0.76)) }))); }
  function clearPattern() { setPads((current) => current.map((pad) => ({ ...pad, steps: pad.steps.map(() => false) }))); }
  function applyPreset(preset: Preset) { setPads((current) => current.map((pad) => ({ ...pad, volume: preset.volumes[pad.id] ?? pad.volume, pan: preset.pans[pad.id] ?? pad.pan }))); }
  async function sendToStudio() {
    if (printing) return;
    setPrinting(true);
    try {
      const stems: PrintedBeatStem[] = await Promise.all(buildBeatStemRenderPlan(pads, bpm).map(async (stem) => ({
        ...stem,
        blob: await renderBeatStem(stem),
        name: stem.id,
        kind: stem.id === "bass" ? "bass" as const : stem.id === "vox" ? "vocal" as const : stem.id === "fx" ? "fx" as const : "drum" as const,
      })));
      if (onPrintToStudio) {
        await onPrintToStudio(stems);
        return;
      }
      window.dispatchEvent(new CustomEvent("ems:beat-stems-to-session", { detail: { stems, autoMix: true } }));
    } finally {
      setPrinting(false);
    }
  }
  function exportPattern() { download("ems-beat-pattern.json", JSON.stringify({ bpm, pads: pads.map(({ id, label, volume, pan, muted, solo, steps }) => ({ id, label, volume, pan, muted, solo, steps })) }, null, 2)); }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.code === "Space") { event.preventDefault(); play(); return; }
      const pad = pads.find((item) => item.key.toLowerCase() === event.key.toLowerCase());
      if (!pad) return;
      event.preventDefault();
      setSelected(pad.id);
      trigger(pad);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });
  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);

  return <div className={cn(studioMode ? "h-full" : "min-h-screen", "min-h-0 overflow-hidden bg-[#0b0d10] text-white")}>
    <div className="grid h-full min-h-0 grid-rows-[34px_1fr]">
      <div className="flex h-[34px] items-center border-b border-black bg-[#202329] text-[11px] uppercase tracking-[0.14em] text-white/70">
        <div className="flex h-full items-center border-r border-black px-4 font-black text-cyan-200">Beat Machine</div>
        <button onClick={play} className={cn("h-full border-r border-black px-5 font-black", playing ? "bg-red-500 text-black" : "bg-green-400 text-black")}>{playing ? "Stop" : "Play"}</button>
        <button onClick={stop} className="h-full border-r border-black bg-[#30343b] px-4 font-black">Reset</button>
        <button onClick={randomize} className="h-full border-r border-black bg-[#30343b] px-4 font-black">Generate</button>
        <button onClick={clearPattern} className="h-full border-r border-black bg-[#30343b] px-4 font-black">Clear</button>
        <button onClick={() => void sendToStudio()} disabled={printing} className="h-full border-r border-black bg-cyan-300 px-4 font-black text-black disabled:opacity-60">{printing ? "Printing…" : "Print To Studio"}</button>
        <button onClick={exportPattern} className="h-full border-r border-black bg-[#30343b] px-4 font-black">Export</button>
        <label className="ml-auto flex h-full items-center border-l border-black px-4 font-black">BPM <input value={bpm} type="number" onChange={(event) => setBpm(Number(event.target.value) || 120)} className="ml-2 w-16 bg-black px-2 py-1 font-mono text-cyan-200 outline-none" /></label>
      </div>
      <main className="grid min-h-0 grid-cols-[360px_1fr] overflow-hidden">
        <section className="min-h-0 overflow-auto border-r border-black bg-[#111418] p-3">
          <div className="grid grid-cols-4 gap-2">
            {pads.map((pad) => <button key={pad.id} onClick={() => { setSelected(pad.id); trigger(pad); }} className="relative aspect-square border bg-gradient-to-b from-[#2c2d2f] to-[#101112] p-2" style={{ borderColor: selected === pad.id ? pad.color : "rgba(255,255,255,.16)", boxShadow: selected === pad.id ? `0 0 16px ${pad.color}55` : "inset 0 1px 0 rgba(255,255,255,.08)" }}><span className="grid h-full place-items-center text-[12px] font-black tracking-[0.08em]">{pad.label}</span><span className="absolute bottom-2 right-2 font-mono text-[10px] text-white/40">{pad.key}</span></button>)}
          </div>
          <div className="mt-4 border-t border-white/10 pt-4">
            <b className="block text-xl" style={{ color: activePad.color }}>{activePad.label}</b>
            <div className="mt-3 space-y-3">
              {(["volume", "pan", "freq"] as const).map((field) => <label key={field} className="block text-[10px] font-black uppercase text-white/55">{field}<input className="mt-2 w-full accent-cyan-300" type="range" min={field === "pan" ? -50 : field === "freq" ? 30 : 0} max={field === "pan" ? 50 : field === "freq" ? 8000 : 100} value={activePad[field]} onChange={(event) => updatePad(activePad.id, { [field]: Number(event.target.value) })} /></label>)}
              <div className="flex gap-2"><button onClick={() => updatePad(activePad.id, { muted: !activePad.muted })} className={cn("h-8 flex-1 border border-black bg-[#30343b] text-[10px] font-black uppercase", activePad.muted && "bg-red-400 text-black")}>Mute</button><button onClick={() => updatePad(activePad.id, { solo: !activePad.solo })} className={cn("h-8 flex-1 border border-black bg-[#30343b] text-[10px] font-black uppercase", activePad.solo && "bg-yellow-300 text-black")}>Solo</button><button onClick={() => trigger(activePad)} className="h-8 flex-1 border border-black bg-cyan-300 text-[10px] font-black uppercase text-black">Test</button></div>
              <div className="grid gap-2 pt-2">{presets.map((preset) => <button key={preset.name} onClick={() => applyPreset(preset)} className="border border-white/10 bg-black/35 px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-white/65 hover:text-cyan-100">{preset.name}</button>)}</div>
            </div>
          </div>
        </section>
        <section className="min-h-0 overflow-auto bg-[#15191d] p-4">
          <div className="mb-3 grid min-w-[760px] grid-cols-[72px_repeat(16,minmax(0,1fr))] gap-2 text-center font-mono text-[10px] text-white/35">
            <span />{Array.from({ length: 16 }, (_, i) => <span key={i} className={cn(step === i && "text-cyan-200")}>{i + 1}</span>)}
          </div>
          <div className="min-w-[760px] space-y-1.5">
            {pads.map((pad) => <div key={pad.id} className="grid items-center gap-2" style={{ gridTemplateColumns: "72px repeat(16,minmax(0,1fr))" }}><button onClick={() => setSelected(pad.id)} className="truncate border-r border-white/10 pr-2 text-left font-mono text-[10px] uppercase" style={{ color: selected === pad.id ? pad.color : "rgba(255,255,255,.55)" }}>{pad.label}</button>{pad.steps.map((on, i) => <button key={i} onClick={() => toggleStep(pad.id, i)} className={cn("h-10 border", step === i && "ring-2 ring-white/60")} style={{ backgroundColor: on ? pad.color : "rgba(255,255,255,.035)", borderColor: on ? pad.color : "rgba(255,255,255,.08)", boxShadow: on ? `0 0 10px ${pad.color}80` : undefined }} />)}</div>)}
          </div>
        </section>
      </main>
    </div>
  </div>;
}
