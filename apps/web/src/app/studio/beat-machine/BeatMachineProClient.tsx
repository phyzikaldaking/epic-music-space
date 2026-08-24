"use client";

import { useEffect, useRef, useState } from "react";
import { studioTransport } from "../../../lib/studioTransport";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://oynplifjdizzdahnurgi.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const LIVE_SAMPLE_NAMES = [
  "SSO-A&E_1.WAV", "SSO-A&E_12.WAV", "SSO-A&E_24.WAV", "SSO-A&E_46.WAV",
  "SSO-SNARE_11.WAV", "SSO-SNARE_18.WAV", "SSO-SNARE_23.WAV", "SSO-SNARE_28.WAV",
  "SSO-VOCAL_1.WAV", "SSO-VOCAL_2.WAV", "SSO-VOCAL_10.WAV", "SSO-VOCAL_12.WAV",
  "HIP_Snaph_3.wav",
];
const sampleUrl = (name: string) => name === "HIP_Snaph_3.wav"
  ? `${SUPABASE_URL}/storage/v1/object/public/studio-kits/${encodeURIComponent(name)}`
  : `${SUPABASE_URL}/storage/v1/object/public/audio-assets/${encodeURIComponent(name)}`;
import { buildBeatStemRenderPlan, type BeatStemRenderPlan } from "./beatStemPrint";

type Pad = { id: string; label: string; key: string; color: string; freq: number; volume: number; pan: number; muted: boolean; solo: boolean; steps: boolean[]; tune?: number; mode?: "one-shot" | "loop" };
type Preset = { name: string; volumes: Record<string, number>; pans: Record<string, number> };

const makeSteps = (on: number[]) => Array.from({ length: patternLength }, (_, i) => on.includes(i + 1));
const initialPads: Pad[] = [
  { id: "kick", label: "KICK", key: "1", color: "#20f7ff", freq: 54, volume: 88, pan: 0, muted: false, solo: false, steps: makeSteps([]) },
  { id: "snare", label: "SNARE", key: "2", color: "#ff31df", freq: 180, volume: 74, pan: 0, muted: false, solo: false, steps: makeSteps([]) },
  { id: "hat", label: "HAT", key: "3", color: "#a75cff", freq: 6500, volume: 48, pan: 14, muted: false, solo: false, steps: makeSteps([]) },
  { id: "clap", label: "CLAP", key: "4", color: "#a75cff", freq: 260, volume: 60, pan: -8, muted: false, solo: false, steps: makeSteps([]) },
  { id: "bass", label: "808", key: "Q", color: "#f2c85b", freq: 42, volume: 82, pan: 0, muted: false, solo: false, steps: makeSteps([]) },
  { id: "perc", label: "PERC", key: "W", color: "#16e59a", freq: 410, volume: 55, pan: 18, muted: false, solo: false, steps: makeSteps([]) },
  { id: "vox", label: "VOX", key: "E", color: "#20c8ff", freq: 330, volume: 58, pan: -18, muted: false, solo: false, steps: makeSteps([]) },
  { id: "fx", label: "FX", key: "R", color: "#ff4f8b", freq: 920, volume: 42, pan: 24, muted: false, solo: false, steps: makeSteps([]) },
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
  const [padBank, setPadBank] = useState(0);
  const [padBanks, setPadBanks] = useState<Record<number, Pad[]>>(() => ({
    0: initialPads,
    1: initialPads.map((pad) => ({ ...pad, steps: [...pad.steps] })),
    2: initialPads.map((pad) => ({ ...pad, steps: [...pad.steps] })),
    3: initialPads.map((pad) => ({ ...pad, steps: [...pad.steps] })),
  }));
  const pads = padBanks[padBank] ?? initialPads;
  const setPads = (updater: (current: Pad[]) => Pad[]) => setPadBanks((current) => ({ ...current, [padBank]: updater(current[padBank] ?? initialPads) }));
  const [selected, setSelected] = useState("kick");
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(0);
  const [bpm, setBpm] = useState(140);
  const [patternLength, setPatternLength] = useState<8 | 16>(16);
  const [printing, setPrinting] = useState(false);
  const [liveSamples, setLiveSamples] = useState<string[]>(LIVE_SAMPLE_NAMES);
  const [sampleName, setSampleName] = useState<string | null>(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const sampleBuffers = useRef<Record<string, AudioBuffer>>({});
  const transportStep = useRef(-1);
  const audio = useRef<AudioContext | null>(null);
  const activePad = pads.find((pad) => pad.id === selected) ?? pads[0];
  const soloed = pads.some((pad) => pad.solo);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("ems.beat-machine.session.v2");
      if (!raw) return;
      const saved = JSON.parse(raw) as { banks?: Record<string, Pad[]>; activeBank?: number; bpm?: number; patternLength?: number };
      if (saved.banks && typeof saved.banks === "object") {
        setPadBanks(Object.fromEntries(Object.entries(saved.banks).map(([bank, bankPads]) => [Number(bank), bankPads])));
      }
      if (saved.activeBank === 0 || saved.activeBank === 1 || saved.activeBank === 2 || saved.activeBank === 3) setPadBank(saved.activeBank);
      if (typeof saved.bpm === "number" && saved.bpm >= 40 && saved.bpm <= 240) setBpm(saved.bpm);
      if (saved.patternLength === 8 || saved.patternLength === 16) setPatternLength(saved.patternLength);
    } catch {
      localStorage.removeItem("ems.beat-machine.session.v2");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("ems.beat-machine.session.v2", JSON.stringify({
      banks: padBanks,
      activeBank: padBank,
      bpm,
      patternLength,
    }));
  }, [padBanks, padBank, bpm, patternLength]);

  function context() { audio.current ??= new AudioContext(); return audio.current; }
  async function loadSample(name: string) {
    setSampleLoading(true);
    setSampleError(null);
    try {
      const ctx = context();
      await ctx.resume();
      if (!sampleBuffers.current[name]) {
        const response = await fetch(sampleUrl(name));
        if (!response.ok) throw new Error(`Could not load ${name} (${response.status})`);
        sampleBuffers.current[name] = await ctx.decodeAudioData(await response.arrayBuffer());
      }
      setSampleName(name);
      sampleBuffers.current[padBank + ":" + selected] = sampleBuffers.current[name];
      trigger({ ...activePad, id: selected });
    } catch (error) {
      setSampleError(error instanceof Error ? error.message : `Could not load ${name}`);
    } finally {
      setSampleLoading(false);
    }
  }
  async function previewSample(name: string) {
    setSampleLoading(true);
    setSampleError(null);
    try {
      const ctx = context();
      await ctx.resume();
      if (!sampleBuffers.current[name]) {
        const response = await fetch(sampleUrl(name));
        if (!response.ok) throw new Error(`Could not preview ${name} (${response.status})`);
        sampleBuffers.current[name] = await ctx.decodeAudioData(await response.arrayBuffer());
      }
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = sampleBuffers.current[name];
      gain.gain.value = 0.6;
      source.connect(gain).connect(ctx.destination);
      source.start();
    } catch (error) {
      setSampleError(error instanceof Error ? error.message : `Could not preview ${name}`);
    } finally {
      setSampleLoading(false);
    }
  }
  useEffect(() => {
    if (!SUPABASE_ANON_KEY) return;
    void fetch(`${SUPABASE_URL}/storage/v1/object/list/audio-assets`, { method: "POST", headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ prefix: "", limit: 1000, sortBy: { column: "created_at", order: "desc" } }) })
      .then((response) => response.ok ? response.json() : [])
      .then((items: Array<{ name?: string }>) => { const names = items.map((item) => item.name).filter((name): name is string => Boolean(name && /\.(wav|mp3|ogg|m4a)$/i.test(name))); if (names.length) setLiveSamples(Array.from(new Set([...LIVE_SAMPLE_NAMES, ...names]))); })
      .catch(() => undefined);
  }, []);
  function trigger(pad: Pad, velocity = 1) {
    if (pad.muted || (soloed && !pad.solo)) return;
    const ctx = context();
    const now = ctx.currentTime;
    const buffer = sampleBuffers.current[padBank + ":" + pad.id];
    if (buffer) {
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const pan = ctx.createStereoPanner();
      source.buffer = buffer;
      source.playbackRate.value = (pad.id === "bass" ? 0.85 : 1) * Math.pow(2, (pad.tune ?? 0) / 12);
      source.loop = pad.mode === "loop";
      gain.gain.value = Math.max(0.001, (pad.volume / 100) * velocity * 0.55);
      pan.pan.value = Math.max(-1, Math.min(1, pad.pan / 50));
      source.connect(gain).connect(pan).connect(ctx.destination);
      source.start(now);
      if (pad.mode === "loop") source.stop(now + Math.max(0.25, Math.min(8, buffer.duration)));
      return;
    }
    // Real sample playback is required. An empty pad stays silent until the producer loads a Supabase asset.
    return;
  }
  function updatePad(id: string, patch: Partial<Pad>) { setPads((current) => current.map((pad) => pad.id === id ? { ...pad, ...patch } : pad)); }
  function toggleStep(id: string, index: number) { setPads((current) => current.map((pad) => pad.id === id ? { ...pad, steps: pad.steps.map((on, i) => i === index ? !on : on) } : pad)); }
  function stop() { studioTransport.stop(true); transportStep.current = -1; setPlaying(false); setStep(0); }
  function play() {
    if (playing) { stop(); return; }
    void context().resume();
    studioTransport.setBpm(bpm);
    studioTransport.play();
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
  function exportPattern() {
    download("ems-beat-pattern.json", JSON.stringify({
      version: 2,
      bpm,
      patternLength,
      activeBank: padBank,
      banks: Object.fromEntries(Object.entries(padBanks).map(([bank, bankPads]) => [bank, bankPads.map(({ id, label, volume, pan, muted, solo, steps, tune, mode }) => ({ id, label, volume, pan, muted, solo, steps, tune, mode }))])),
    }, null, 2));
  }

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
  useEffect(() => {
    studioTransport.setBpm(bpm);
    return studioTransport.subscribe((state) => {
      const nextStep = Math.floor(state.positionSec / (60 / bpm / 4)) % patternLength;
      if (!state.playing || nextStep === transportStep.current) return;
      transportStep.current = nextStep;
      setStep(nextStep);
      pads.forEach((pad) => { if (pad.steps[nextStep]) trigger(pad, 0.88); });
      setPlaying(true);
    });
  }, [bpm, pads, patternLength]);

  return <div className={cn(studioMode ? "h-full" : "min-h-screen", "min-h-0 overflow-hidden bg-[#0b0d10] text-white")}>
    <div className="grid h-full min-h-0 grid-rows-[34px_1fr]">
      <div className="flex h-[34px] items-center border-b border-black bg-[#202329] text-[11px] uppercase tracking-[0.14em] text-white/70">
        <div className="flex h-full items-center border-r border-black px-4 font-black text-cyan-200">Beat Machine</div>
        <div className="flex h-full items-center border-r border-black">
          {[0, 1, 2, 3].map((bank) => <button key={bank} onClick={() => setPadBank(bank)} className={cn("h-full px-3 font-black", padBank === bank ? "bg-cyan-300 text-black" : "bg-[#30343b] text-white/60")}>Bank {bank + 1}</button>)}
        </div>
        <button onClick={play} className={cn("h-full border-r border-black px-5 font-black", playing ? "bg-red-500 text-black" : "bg-green-400 text-black")}>{playing ? "Stop" : "Play"}</button>
        <button onClick={stop} className="h-full border-r border-black bg-[#30343b] px-4 font-black">Reset</button>
        <button onClick={randomize} className="h-full border-r border-black bg-[#30343b] px-4 font-black">Generate</button>
        <button onClick={clearPattern} className="h-full border-r border-black bg-[#30343b] px-4 font-black">Clear</button>
        <button onClick={() => void sendToStudio()} disabled={printing} className="h-full border-r border-black bg-cyan-300 px-4 font-black text-black disabled:opacity-60">{printing ? "Printing…" : "Print To Studio"}</button>
        <div className="flex h-full items-center border-r border-black"><span className="px-2 text-[9px] text-white/40">STEPS</span>{([8, 16] as const).map((length) => <button key={length} onClick={() => setPatternLength(length)} className={cn("h-full px-2 font-black", patternLength === length ? "bg-purple-300 text-black" : "bg-[#30343b] text-white/60")}>{length}</button>)}</div>
        <button onClick={exportPattern} className="h-full border-r border-black bg-[#30343b] px-4 font-black">Export</button>
        <label className="ml-auto flex h-full items-center border-l border-black px-4 font-black">BPM <input value={bpm} type="number" onChange={(event) => setBpm(Number(event.target.value) || 120)} className="ml-2 w-16 bg-black px-2 py-1 font-mono text-cyan-200 outline-none" /></label>
      </div>
      <main className="grid min-h-0 grid-cols-[360px_1fr] overflow-hidden">
        <section className="min-h-0 overflow-auto border-r border-black bg-[#111418] p-3">
          <div className="grid grid-cols-4 gap-2">
            {pads.map((pad) => <button key={pad.id} onClick={() => { setSelected(pad.id); trigger(pad); }} className="relative aspect-square border bg-gradient-to-b from-[#2c2d2f] to-[#101112] p-2" style={{ borderColor: selected === pad.id ? pad.color : "rgba(255,255,255,.16)", boxShadow: selected === pad.id ? `0 0 16px ${pad.color}55` : "inset 0 1px 0 rgba(255,255,255,.08)" }}><span className="grid h-full place-items-center text-[12px] font-black tracking-[0.08em]">{pad.label}</span><span className="absolute bottom-2 right-2 font-mono text-[10px] text-white/40">{pad.key}</span></button>)}
          </div>
          <div className="mt-4 border-t border-white/10 pt-4"><div className="mb-3 flex items-center justify-between"><b className="text-[11px] uppercase tracking-widest text-cyan-200">Live Sample Library</b><span className="font-mono text-[10px] text-white/35">{liveSamples.length} sounds</span></div><div className="max-h-52 space-y-1 overflow-auto pr-1">{liveSamples.slice(0, 80).map((name) => <div key={name} className="flex gap-1"><button onClick={() => void previewSample(name)} disabled={sampleLoading} className="min-w-0 flex-1 truncate border border-white/10 bg-black/25 px-2 py-2 text-left text-[10px] font-bold uppercase text-white/60 hover:border-cyan-300/60 hover:text-white">{name.replace(/\.(wav|mp3|ogg|m4a)$/i, "")}</button><button onClick={() => void loadSample(name)} disabled={sampleLoading} className="shrink-0 border border-cyan-300/40 px-2 text-[9px] font-black text-cyan-200 disabled:opacity-50">LOAD</button></div>)}</div></div>{sampleLoading && <p className="mt-2 text-[9px] font-bold uppercase text-cyan-200">Loading sample…</p>}{sampleError && <p className="mt-2 text-[9px] font-bold uppercase text-red-300">{sampleError}</p>}<p className="mt-2 text-[9px] leading-4 text-white/35">Samples load from Supabase Storage and replace the selected pad sound. Tap a pad, then load a sound.</p></div><div className="mt-4 border-t border-white/10 pt-4">
            <b className="block text-xl" style={{ color: activePad.color }}>{activePad.label}</b>
            <div className="mt-3 space-y-3">
              <label className="block text-[10px] font-black uppercase text-white/55">Playback mode<select value={activePad.mode ?? "one-shot"} onChange={(event) => updatePad(activePad.id, { mode: event.target.value as "one-shot" | "loop" })} className="mt-2 w-full bg-black px-2 py-2 text-cyan-200"><option value="one-shot">One-shot</option><option value="loop">Loop</option></select></label>
              <label className="block text-[10px] font-black uppercase text-white/55">Tune (semitones)<input className="mt-2 w-full accent-cyan-300" type="range" min="-24" max="24" value={activePad.tune ?? 0} onChange={(event) => updatePad(activePad.id, { tune: Number(event.target.value) })} /></label>
              {(["volume", "pan", "freq"] as const).map((field) => <label key={field} className="block text-[10px] font-black uppercase text-white/55">{field}<input className="mt-2 w-full accent-cyan-300" type="range" min={field === "pan" ? -50 : field === "freq" ? 30 : 0} max={field === "pan" ? 50 : field === "freq" ? 8000 : 100} value={activePad[field]} onChange={(event) => updatePad(activePad.id, { [field]: Number(event.target.value) })} /></label>)}
              <div className="flex gap-2"><button onClick={() => updatePad(activePad.id, { muted: !activePad.muted })} className={cn("h-8 flex-1 border border-black bg-[#30343b] text-[10px] font-black uppercase", activePad.muted && "bg-red-400 text-black")}>Mute</button><button onClick={() => updatePad(activePad.id, { solo: !activePad.solo })} className={cn("h-8 flex-1 border border-black bg-[#30343b] text-[10px] font-black uppercase", activePad.solo && "bg-yellow-300 text-black")}>Solo</button><button onClick={() => trigger(activePad)} className="h-8 flex-1 border border-black bg-cyan-300 text-[10px] font-black uppercase text-black">Test</button></div>
              <div className="grid gap-2 pt-2">{presets.map((preset) => <button key={preset.name} onClick={() => applyPreset(preset)} className="border border-white/10 bg-black/35 px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-white/65 hover:text-cyan-100">{preset.name}</button>)}</div>
            </div>
          </div>
        </section>
        <section className="min-h-0 overflow-auto bg-[#15191d] p-4">
          <div className="mb-3 grid min-w-[760px] grid-cols-[72px_repeat(${patternLength},minmax(0,1fr))] gap-2 text-center font-mono text-[10px] text-white/35">
            <span />{Array.from({ length: 16 }, (_, i) => <span key={i} className={cn(step === i && "text-cyan-200")}>{i + 1}</span>)}
          </div>
          <div className="min-w-[760px] space-y-1.5">
            {pads.map((pad) => <div key={pad.id} className="grid items-center gap-2" style={{ gridTemplateColumns: `72px repeat(${patternLength},minmax(0,1fr))` }}><button onClick={() => setSelected(pad.id)} className="truncate border-r border-white/10 pr-2 text-left font-mono text-[10px] uppercase" style={{ color: selected === pad.id ? pad.color : "rgba(255,255,255,.55)" }}>{pad.label}</button>{pad.steps.slice(0, patternLength).map((on, i) => <button key={i} onClick={() => toggleStep(pad.id, i)} className={cn("h-10 border", step === i && "ring-2 ring-white/60")} style={{ backgroundColor: on ? pad.color : "rgba(255,255,255,.035)", borderColor: on ? pad.color : "rgba(255,255,255,.08)", boxShadow: on ? `0 0 10px ${pad.color}80` : undefined }} />)}</div>)}
          </div>
        </section>
      </main>
    </div>
  </div>;
}
