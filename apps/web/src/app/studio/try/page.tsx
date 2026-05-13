"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export const dynamic = "force-dynamic";

const tracks = ["Lead Vox", "Adlibs", "Beat", "808", "Keys", "FX", "Hook", "Master"];
const lanes = ["Kick", "Snare", "Hat", "808", "Perc", "Clap"] as const;
const steps = Array.from({ length: 16 }, (_, index) => index);

type Lane = (typeof lanes)[number];
type Pattern = Record<Lane, boolean[]>;

function makePattern(): Pattern {
  return lanes.reduce((acc, lane, laneIndex) => {
    acc[lane] = steps.map((step) => {
      if (lane === "Kick") return step % 4 === 0;
      if (lane === "Snare") return step === 4 || step === 12;
      if (lane === "Hat") return step % 2 === 0;
      if (lane === "808") return step === 0 || step === 7 || step === 10;
      return (step + laneIndex) % 5 === 0;
    });
    return acc;
  }, {} as Pattern);
}

function getAudioCtor() {
  return window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

function playSynthHit(ctx: AudioContext, lane: Lane, when: number, output: AudioNode) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const config: Record<Lane, { freq: number; type: OscillatorType; dur: number; vol: number }> = {
    Kick: { freq: 55, type: "sine", dur: 0.18, vol: 0.72 },
    Snare: { freq: 190, type: "triangle", dur: 0.11, vol: 0.34 },
    Hat: { freq: 7200, type: "square", dur: 0.035, vol: 0.11 },
    "808": { freq: 42, type: "sine", dur: 0.32, vol: 0.58 },
    Perc: { freq: 420, type: "sawtooth", dur: 0.08, vol: 0.18 },
    Clap: { freq: 980, type: "square", dur: 0.07, vol: 0.16 },
  };
  const sound = config[lane];
  osc.type = sound.type;
  osc.frequency.setValueAtTime(sound.freq, when);
  if (lane === "Kick" || lane === "808") {
    osc.frequency.exponentialRampToValueAtTime(Math.max(22, sound.freq * 0.52), when + sound.dur);
  }
  filter.type = lane === "Hat" ? "highpass" : "lowpass";
  filter.frequency.setValueAtTime(lane === "Hat" ? 3500 : 1800, when);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(sound.vol, when + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + sound.dur);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(output);
  osc.start(when);
  osc.stop(when + sound.dur + 0.03);
}

function wavBlobFromBuffer(buffer: AudioBuffer) {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length * channels * 2 + 44;
  const arrayBuffer = new ArrayBuffer(length);
  const view = new DataView(arrayBuffer);
  let offset = 0;
  const writeString = (value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
    offset += value.length;
  };
  writeString("RIFF");
  view.setUint32(offset, length - 8, true); offset += 4;
  writeString("WAVE");
  writeString("fmt ");
  view.setUint32(offset, 16, true); offset += 4;
  view.setUint16(offset, 1, true); offset += 2;
  view.setUint16(offset, channels, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, sampleRate * channels * 2, true); offset += 4;
  view.setUint16(offset, channels * 2, true); offset += 2;
  view.setUint16(offset, 16, true); offset += 2;
  writeString("data");
  view.setUint32(offset, length - offset - 4, true); offset += 4;
  for (let i = 0; i < buffer.length; i += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([arrayBuffer], { type: "audio/wav" });
}

export default function StudioTryPage() {
  const [pattern, setPattern] = useState<Pattern>(() => makePattern());
  const [playing, setPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [bpm, setBpm] = useState(90);
  const [masterLevel, setMasterLevel] = useState(76);
  const [latency, setLatency] = useState("--");
  const [midiStatus, setMidiStatus] = useState("checking");
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const timerRef = useRef<number | null>(null);

  const activeCount = useMemo(() => lanes.reduce((sum, lane) => sum + pattern[lane].filter(Boolean).length, 0), [pattern]);

  const ensureAudio = async () => {
    const Ctor = getAudioCtor();
    if (!Ctor) return null;
    if (!audioRef.current) {
      const ctx = new Ctor();
      const master = ctx.createGain();
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 18;
      compressor.ratio.value = 3;
      compressor.attack.value = 0.01;
      compressor.release.value = 0.16;
      master.gain.value = masterLevel / 100;
      master.connect(compressor);
      compressor.connect(ctx.destination);
      audioRef.current = ctx;
      masterRef.current = master;
      compressorRef.current = compressor;
      setLatency(`${Math.round((ctx.baseLatency || 0) * 1000)}ms`);
    }
    if (audioRef.current.state === "suspended") await audioRef.current.resume();
    return audioRef.current;
  };

  useEffect(() => {
    if (masterRef.current) masterRef.current.gain.value = masterLevel / 100;
  }, [masterLevel]);

  useEffect(() => {
    const nav = navigator as Navigator & { requestMIDIAccess?: () => Promise<MIDIAccess> };
    if (!nav.requestMIDIAccess) {
      setMidiStatus("browser unsupported");
      return;
    }
    nav.requestMIDIAccess().then((access) => {
      setMidiStatus(`${access.inputs.size} input / ${access.outputs.size} output`);
    }).catch(() => setMidiStatus("permission needed"));
  }, []);

  useEffect(() => {
    if (!playing) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    let step = currentStep;
    const interval = (60_000 / bpm) / 4;
    timerRef.current = window.setInterval(() => {
      void ensureAudio().then((ctx) => {
        if (!ctx || !masterRef.current) return;
        const when = ctx.currentTime + 0.012;
        lanes.forEach((lane) => {
          if (pattern[lane][step]) playSynthHit(ctx, lane, when, masterRef.current!);
        });
      });
      setCurrentStep(step);
      step = (step + 1) % 16;
    }, interval);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [playing, bpm, currentStep, pattern]);

  const playLane = async (lane: Lane) => {
    const ctx = await ensureAudio();
    if (!ctx || !masterRef.current) return;
    playSynthHit(ctx, lane, ctx.currentTime + 0.01, masterRef.current);
  };

  const toggleStep = (lane: Lane, step: number) => {
    setPattern((prev) => ({ ...prev, [lane]: prev[lane].map((value, index) => (index === step ? !value : value)) }));
    void playLane(lane);
  };

  const exportLoop = async () => {
    const sampleRate = 44100;
    const barsSeconds = (60 / bpm) * 4;
    const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * barsSeconds), sampleRate);
    const master = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();
    master.gain.value = masterLevel / 100;
    master.connect(compressor);
    compressor.connect(ctx.destination);
    const stepDur = barsSeconds / 16;
    steps.forEach((step) => {
      lanes.forEach((lane) => {
        if (pattern[lane][step]) playSynthHit(ctx as unknown as AudioContext, lane, step * stepDur, master);
      });
    });
    const rendered = await ctx.startRendering();
    const blob = wavBlobFromBuffer(rendered);
    if (exportUrl) URL.revokeObjectURL(exportUrl);
    setExportUrl(URL.createObjectURL(blob));
  };

  return (
    <main className="min-h-[calc(100vh-65px)] overflow-hidden bg-[#05060b] text-white" data-studio-content="true">
      <section className="sticky top-0 z-30 border-b border-white/10 bg-black/90 px-3 py-2 shadow-2xl shadow-black/50 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-2">
          <div className="mr-3 min-w-[210px]">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-200/80">EMS Pro Studio</p>
            <h1 className="font-display text-lg uppercase tracking-[0.12em] text-white sm:text-xl">Audio Engine DAW</h1>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.04] p-1">
            <button type="button" onClick={() => setCurrentStep(0)} className="grid h-10 w-10 place-items-center rounded-full bg-black/60 text-sm text-white/85 hover:bg-cyan-400/20">⏮</button>
            <button type="button" onClick={() => setPlaying((value) => !value)} className="grid h-10 min-w-12 place-items-center rounded-full bg-cyan-300 px-3 text-sm font-black text-black">{playing ? "⏹" : "▶"}</button>
            <button type="button" onClick={() => void playLane("Kick")} className="grid h-10 w-10 place-items-center rounded-full bg-red-500/80 text-sm text-white">⏺</button>
          </div>
          <div className="rounded-md border border-white/10 bg-black/55 px-3 py-2 font-mono text-sm text-emerald-200">STEP {String(currentStep + 1).padStart(2, "0")}</div>
          <label className="flex items-center gap-2 rounded-md border border-white/10 bg-black/55 px-3 py-2 text-xs font-black uppercase tracking-widest text-white/70">BPM <input type="range" min="70" max="160" value={bpm} onChange={(event) => setBpm(Number(event.target.value))} className="w-24 accent-cyan-300" /> {bpm}</label>
          <label className="flex items-center gap-2 rounded-md border border-white/10 bg-black/55 px-3 py-2 text-xs font-black uppercase tracking-widest text-white/70">Master <input type="range" min="0" max="100" value={masterLevel} onChange={(event) => setMasterLevel(Number(event.target.value))} className="w-24 accent-fuchsia-300" /></label>
          <nav className="ml-auto flex overflow-x-auto rounded-md border border-cyan-300/20 bg-cyan-300/5 p-1 text-[11px] font-black uppercase tracking-widest">
            {["Edit", "Mix", "Beat", "Export"].map((tab) => <a key={tab} href={`#${tab.toLowerCase()}`} className="rounded px-4 py-2 text-cyan-100 hover:bg-cyan-300/20">{tab}</a>)}
          </nav>
        </div>
      </section>

      <section id="edit" className="mx-auto grid max-w-[1500px] gap-3 px-3 py-3 lg:grid-cols-[220px_1fr_300px]">
        <aside className="rounded-xl border border-white/10 bg-[#080a12] p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/40">Engine Status</p>
          {[`Audio Graph: ${audioRef.current ? "armed" : "tap play"}`, `Latency: ${latency}`, `MIDI: ${midiStatus}`, `Pattern Steps: ${activeCount}`].map((item) => <div key={item} className="mt-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-3 text-xs font-bold text-white/75">{item}</div>)}
        </aside>
        <div className="rounded-xl border border-white/10 bg-[#090b14] p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200/70">Edit Window</p><h2 className="text-lg font-black uppercase tracking-[0.08em]">Waveform + Transport Timeline</h2></div><button type="button" onClick={() => void playLane("Clap")} className="rounded-md bg-cyan-300 px-3 py-2 text-xs font-black uppercase tracking-widest text-black">Audition Clip</button></div>
          <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/40"><div className="min-w-[900px]"><div className="grid grid-cols-[120px_repeat(16,minmax(44px,1fr))] border-b border-white/10 text-[10px] uppercase tracking-widest text-white/45"><div className="border-r border-white/10 p-2">Bars</div>{steps.map((step) => <div key={step} className={`border-r border-white/5 p-2 text-center ${currentStep === step ? "bg-cyan-300/20 text-cyan-100" : ""}`}>{step + 1}</div>)}</div>{tracks.slice(0, 6).map((track, row) => <div key={track} className="grid grid-cols-[120px_repeat(16,minmax(44px,1fr))] border-b border-white/6"><div className="border-r border-white/10 bg-white/[0.03] p-2 text-xs font-bold text-white/70">{track}</div>{steps.map((step) => <div key={step} className={`h-12 border-r border-white/5 p-1 ${currentStep === step ? "bg-cyan-300/10" : ""}`}>{(step + row) % 3 === 0 && <div className="h-full rounded bg-gradient-to-r from-cyan-400/50 to-fuchsia-400/40" />}</div>)}</div>)}</div></div>
        </div>
        <aside className="rounded-xl border border-white/10 bg-[#080a12] p-3"><p className="text-[10px] font-black uppercase tracking-[0.22em] text-fuchsia-200/70">Plugin DSP Chain</p>{["EQ", "Compressor", "Limiter"].map((plugin) => <button key={plugin} type="button" onClick={() => void playLane("Perc")} className="mt-3 block w-full rounded-lg border border-white/10 bg-black/40 p-3 text-left text-xs font-black uppercase tracking-widest text-white/80">{plugin} · ON</button>)}</aside>
      </section>

      <section id="mix" className="mx-auto max-w-[1500px] px-3 pb-3"><div className="rounded-xl border border-white/10 bg-[#070910] p-3"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-black uppercase tracking-[0.08em]">Real-Time Mixer Graph</h2><p className="text-xs text-white/50">Master gain → compressor → output.</p></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">{tracks.map((track, index) => <article key={track} className="rounded-lg border border-white/10 bg-black/50 p-2"><div className="mb-2 rounded bg-white/[0.04] px-2 py-1 text-center text-[11px] font-black uppercase tracking-widest text-white/75">{track}</div><div className="grid grid-cols-2 gap-1 text-[9px] font-bold uppercase tracking-wider">{["EQ", "Comp", "Tune", "Send"].map((fx) => <button key={fx} onClick={() => void playLane(index % 2 ? "Hat" : "Kick")} className="rounded border border-cyan-300/20 bg-cyan-300/8 px-1 py-2 text-cyan-100">{fx}</button>)}</div><div className="mt-3 flex h-36 items-end justify-center gap-2 rounded bg-white/[0.03] p-2"><div className="flex h-full w-3 items-end rounded bg-white/10"><div className="w-full rounded bg-emerald-400" style={{ height: `${Math.max(20, masterLevel - index * 4)}%` }} /></div><input aria-label={`${track} fader`} type="range" min="0" max="100" defaultValue={70 - index * 4} className="h-28 w-5 rotate-[-90deg] accent-cyan-300" /></div></article>)}</div></div></section>

      <section id="beat" className="mx-auto max-w-[1500px] px-3 pb-6"><div className="rounded-xl border border-white/10 bg-[#090b14] p-3"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-black uppercase tracking-[0.08em]">MPC / MIDI Step Sequencer</h2><p className="text-xs text-white/50">Tap pads to program, audition, and schedule audio.</p></div><button type="button" onClick={() => setPattern(makePattern())} className="rounded-md bg-fuchsia-400 px-3 py-2 text-xs font-black uppercase tracking-widest text-black">Generate Pattern</button></div><div className="grid gap-2 overflow-x-auto pb-2">{lanes.map((lane) => <div key={lane} className="grid min-w-[760px] grid-cols-[90px_repeat(16,minmax(36px,1fr))] gap-1"><button type="button" onClick={() => void playLane(lane)} className="rounded bg-white/[0.05] px-2 py-2 text-xs font-black uppercase tracking-widest text-white/70">{lane}</button>{steps.map((step) => { const active = pattern[lane][step]; const hot = currentStep === step && playing; return <button key={step} type="button" onClick={() => toggleStep(lane, step)} className={`h-11 rounded border text-xs font-black ${active ? "border-fuchsia-300 bg-fuchsia-400 text-black" : "border-white/10 bg-black/50 text-white/30"} ${hot ? "ring-2 ring-cyan-300" : ""}`}>{step + 1}</button>; })}</div>)}</div></div></section>

      <section id="export" className="mx-auto max-w-[1500px] px-3 pb-10"><div className="rounded-xl border border-white/10 bg-black/50 p-4"><h2 className="text-lg font-black uppercase tracking-[0.08em]">Audio Export Engine</h2><p className="mt-2 text-sm text-white/60">Offline renders the programmed loop to WAV using the same synth hit graph.</p><div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => void exportLoop()} className="rounded-md bg-emerald-300 px-4 py-3 text-xs font-black uppercase tracking-widest text-black">Render WAV</button>{exportUrl && <a href={exportUrl} download="ems-studio-loop.wav" className="rounded-md border border-emerald-300/35 bg-emerald-300/10 px-4 py-3 text-xs font-black uppercase tracking-widest text-emerald-100">Download WAV</a>}</div></div></section>
    </main>
  );
}
