"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type View = "machine" | "sampler" | "piano" | "sounds" | "mixer" | "arrange" | "export";
type Pad = { id: string; label: string; key: string; color: string; freq: number; volume: number; pan: number; muted: boolean; solo: boolean; steps: boolean[] };
type Preset = { name: string; color: string; volumes: Record<string, number>; pans: Record<string, number> };
type SoundChoice = { name: string; target: string; label: string; color: string; freq: number };

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
  { name: "Clean Radio Punch", color: "#20f7ff", volumes: { kick: 90, snare: 76, hat: 44, clap: 58, bass: 80, perc: 48, vox: 56, fx: 38 }, pans: { hat: 12, perc: 18, vox: -14, fx: 22 } },
  { name: "Trap Knock", color: "#f2c85b", volumes: { kick: 94, snare: 72, hat: 52, clap: 50, bass: 92, perc: 54, vox: 44, fx: 34 }, pans: { hat: 8, perc: -18, vox: 16, fx: 28 } },
  { name: "Vocal Sample Glue", color: "#ff31df", volumes: { kick: 76, snare: 68, hat: 38, clap: 44, bass: 66, perc: 42, vox: 86, fx: 50 }, pans: { vox: 0, fx: 20, perc: -20 } },
  { name: "Lo-Fi Space", color: "#16e59a", volumes: { kick: 68, snare: 58, hat: 34, clap: 42, bass: 62, perc: 38, vox: 72, fx: 64 }, pans: { hat: 18, perc: -22, vox: -8, fx: 30 } },
];

const sounds: SoundChoice[] = [
  { name: "HARD_KICK_01", target: "kick", label: "KICK", color: "#20f7ff", freq: 52 },
  { name: "DARK_SNARE_07", target: "snare", label: "SNARE", color: "#ff31df", freq: 188 },
  { name: "BRIGHT_CLAP_04", target: "clap", label: "CLAP", color: "#a75cff", freq: 280 },
  { name: "TIGHT_HAT_09", target: "hat", label: "HAT", color: "#a75cff", freq: 7200 },
  { name: "DEEP_808_12", target: "bass", label: "808", color: "#f2c85b", freq: 42 },
  { name: "TRAP_PERC_HIT_62", target: "perc", label: "PERC", color: "#16e59a", freq: 430 },
  { name: "VOCAL_BAD_05", target: "vox", label: "VOX", color: "#20c8ff", freq: 330 },
  { name: "BRIGHT_CHOP_03", target: "vox", label: "CHOP", color: "#20c8ff", freq: 360 },
  { name: "RISER_FX_02", target: "fx", label: "FX", color: "#ff4f8b", freq: 920 },
  { name: "MOODY_PAD_05", target: "fx", label: "PAD", color: "#ff4f8b", freq: 540 },
  { name: "LOFI_MELODY_02", target: "fx", label: "LOOP", color: "#ff4f8b", freq: 620 },
];
const notes = ["C6", "B5", "A5", "G5", "F5", "E5", "D5", "C5", "B4", "A4", "G4", "F4", "E4", "D4", "C4"];
const wave = Array.from({ length: 128 }, (_, i) => Math.abs(Math.sin(i * 0.31) * Math.cos(i * 0.07)) * (i < 14 || i > 118 ? 0.2 : 1));

function cn(...v: Array<string | false | undefined | null>) { return v.filter(Boolean).join(" "); }
function download(name: string, type: string, text: string) { const blob = new Blob([text], { type }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); }
function Button({ children, active, onClick }: { children: React.ReactNode; active?: boolean; onClick?: () => void }) { return <button onClick={onClick} className={cn("h-8 border border-black/80 bg-[#2f343a] px-3 text-[10px] font-black uppercase tracking-[0.12em] text-white/72 hover:bg-[#414852]", active && "bg-cyan-300 text-black hover:bg-cyan-200")}>{children}</button>; }
function isTypingTarget(target: EventTarget | null) { const el = target as HTMLElement | null; return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)); }

export default function BeatMachineProClient({ initialView = "machine", studioMode = false }: { initialView?: View; studioMode?: boolean }) {
  const [view, setView] = useState<View>(initialView);
  const [pads, setPads] = useState<Pad[]>(initialPads);
  const [selected, setSelected] = useState("kick");
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(0);
  const [bpm, setBpm] = useState(140);
  const [messages, setMessages] = useState<string[]>(["Beat machine ready."]);
  const timer = useRef<number | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const activePad = pads.find((pad) => pad.id === selected) ?? pads[0];
  const soloed = pads.some((pad) => pad.solo);

  function log(message: string) { setMessages((items) => [message, ...items].slice(0, 8)); }
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
    log(`Triggered ${pad.label}`);
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
    log("Pattern playback started.");
  }
  function applyPreset(preset: Preset) { setPads((current) => current.map((pad) => ({ ...pad, volume: preset.volumes[pad.id] ?? pad.volume, pan: preset.pans[pad.id] ?? pad.pan }))); log(`Applied AI preset: ${preset.name}`); }
  function randomize() { setPads((current) => current.map((pad) => ({ ...pad, steps: pad.steps.map((_, i) => i === 0 || Math.random() > (pad.id === "hat" ? 0.45 : 0.76)) }))); log("Generated a new pattern."); }
  function clearPattern() { setPads((current) => current.map((pad) => ({ ...pad, steps: pad.steps.map(() => false) }))); log("Pattern cleared."); }
  function exportSession(kind: "json" | "midi" | "stems") {
    const payload = JSON.stringify({ bpm, pads: pads.map(({ id, label, volume, pan, muted, solo, steps }) => ({ id, label, volume, pan, muted, solo, steps })) }, null, 2);
    download(kind === "json" ? "ems-beat-session.json" : kind === "midi" ? "ems-beat-pattern.mid.txt" : "ems-beat-stems-manifest.json", "application/json", payload);
    log(`Exported ${kind.toUpperCase()}.`);
  }
  function sendToStudio() { window.dispatchEvent(new CustomEvent("ems:beat-stems-to-session", { detail: { stems: pads.map((pad) => ({ label: pad.label, name: pad.id, kind: pad.id === "bass" ? "bass" : pad.id === "vox" ? "vocal" : pad.id === "fx" ? "fx" : "drum", volume: pad.volume, pan: pad.pan })), autoMix: true } })); log("Sent beat stems to Studio mixer."); }
  function assignSound(soundName: string) {
    const sound = sounds.find((item) => item.name === soundName);
    const target = sound?.target ?? selected;
    updatePad(target, sound ? { label: sound.label, color: sound.color, freq: sound.freq } : { label: soundName.split("_")[0] });
    setSelected(target);
    log(`Assigned ${soundName} to ${target.toUpperCase()} pad.`);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat) return;
      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.code === "Space") {
        event.preventDefault();
        play();
        return;
      }
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
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, []);

  const patternText = useMemo(() => pads.map((pad) => `${pad.label}: ${pad.steps.map((on) => on ? "x" : ".").join("")}`).join("\n"), [pads]);
  const compact = studioMode;

  return <div className={cn("min-h-0 flex-1 overflow-hidden bg-[#090b0e] text-white", !compact && "min-h-screen")}>
    <div className="grid h-full min-h-0 grid-rows-[32px_1fr]">
      <div className="flex h-8 items-center border-b border-black bg-[#202329] text-[11px] text-white/72">
        <button onClick={() => setView("machine")} className="h-full border-r border-black px-4 font-black text-cyan-200">Beat Machine</button>
        {(["machine", "sampler", "piano", "sounds", "mixer", "arrange", "export"] as View[]).map((item) => <button key={item} onClick={() => setView(item)} className={cn("h-full border-r border-black px-3 text-[10px] font-black uppercase tracking-[0.12em]", view === item ? "bg-[#d8d2bd] text-black" : "bg-[#2c3036] text-white/60 hover:bg-[#3a4048]")}>{item}</button>)}
        <div className="ml-auto flex h-full items-center gap-2 px-2">
          <Button onClick={play} active={playing}>{playing ? "Stop" : "Play"}</Button>
          <Button onClick={randomize}>Generate</Button>
          <Button onClick={sendToStudio} active>Print</Button>
          <label className="flex h-8 items-center border-l border-black pl-3 text-[10px] uppercase tracking-widest text-white/55">BPM <input className="ml-2 w-14 bg-black px-2 py-1 font-mono text-cyan-200 outline-none" value={bpm} type="number" onChange={(e) => setBpm(Number(e.target.value) || 120)} /></label>
        </div>
      </div>
      <main className="min-h-0 overflow-hidden">{view === "machine" && <Machine pads={pads} selected={selected} step={step} setSelected={setSelected} trigger={trigger} toggleStep={toggleStep} activePad={activePad} updatePad={updatePad} randomize={randomize} clearPattern={clearPattern} applyPreset={applyPreset} />}{view === "sampler" && <Sampler log={log} assign={() => assignSound("BRIGHT_CHOP_03")} />}{view === "piano" && <Piano />}{view === "sounds" && <Sounds assignSound={assignSound} selected={activePad.label} />}{view === "mixer" && <Mixer pads={pads} updatePad={updatePad} applyPreset={applyPreset} />}{view === "arrange" && <Arrange pads={pads} step={step} toggleStep={toggleStep} />}{view === "export" && <Export patternText={patternText} exportSession={exportSession} sendToStudio={sendToStudio} messages={messages} />}</main>
    </div>
  </div>;
}

function Machine({ pads, selected, step, setSelected, trigger, toggleStep, activePad, updatePad, randomize, clearPattern, applyPreset }: { pads: Pad[]; selected: string; step: number; setSelected: (id: string) => void; trigger: (pad: Pad) => void; toggleStep: (id: string, step: number) => void; activePad: Pad; updatePad: (id: string, patch: Partial<Pad>) => void; randomize: () => void; clearPattern: () => void; applyPreset: (preset: Preset) => void }) { return <div className="grid h-full min-h-0 grid-cols-[380px_1fr] overflow-hidden bg-[#0c0f12]"><section className="min-h-0 overflow-auto border-r border-black bg-[#111418] p-3"><div className="grid grid-cols-4 gap-2">{pads.map((pad) => <button key={pad.id} onClick={() => { setSelected(pad.id); trigger(pad); }} className="relative aspect-square border bg-gradient-to-b from-[#2c2d2f] to-[#101112] p-2" style={{ borderColor: selected === pad.id ? pad.color : "rgba(255,255,255,.16)", boxShadow: selected === pad.id ? `0 0 16px ${pad.color}55` : "inset 0 1px 0 rgba(255,255,255,.08)" }}><span className="grid h-full place-items-center text-[12px] font-black tracking-[0.08em]">{pad.label}</span><span className="absolute bottom-2 right-2 font-mono text-[10px] text-white/40">{pad.key}</span></button>)}</div><div className="mt-4 border-t border-white/10 pt-4"><b className="block text-xl" style={{ color: activePad.color }}>{activePad.label}</b><div className="mt-3 space-y-3">{["volume", "pan", "freq"].map((field) => <label key={field} className="block text-[10px] font-black uppercase text-white/55">{field}<input className="mt-2 w-full accent-cyan-300" type="range" min={field === "pan" ? -50 : field === "freq" ? 30 : 0} max={field === "pan" ? 50 : field === "freq" ? 8000 : 100} value={activePad[field as "volume" | "pan" | "freq"]} onChange={(e) => updatePad(activePad.id, { [field]: Number(e.target.value) } as Partial<Pad>)} /></label>)}<div className="flex gap-2"><Button onClick={() => updatePad(activePad.id, { muted: !activePad.muted })} active={activePad.muted}>Mute</Button><Button onClick={() => updatePad(activePad.id, { solo: !activePad.solo })} active={activePad.solo}>Solo</Button><Button onClick={() => trigger(activePad)} active>Test</Button></div></div></div></section><section className="min-h-0 overflow-auto bg-[#15191d] p-4"><div className="mb-3 flex gap-2"><Button onClick={randomize}>Generate</Button><Button onClick={clearPattern}>Clear</Button>{presets.map((preset) => <Button key={preset.name} onClick={() => applyPreset(preset)}>{preset.name}</Button>)}</div><div className="min-w-[760px] space-y-1.5">{pads.map((pad) => <div key={pad.id} className="grid items-center gap-2" style={{ gridTemplateColumns: "72px repeat(16,minmax(0,1fr))" }}><button onClick={() => setSelected(pad.id)} className="truncate border-r border-white/10 pr-2 text-left font-mono text-[10px] uppercase" style={{ color: selected === pad.id ? pad.color : "rgba(255,255,255,.55)" }}>{pad.label}</button>{pad.steps.map((on, i) => <button key={i} onClick={() => toggleStep(pad.id, i)} className={cn("h-8 border", step === i && "ring-2 ring-white/60")} style={{ backgroundColor: on ? pad.color : "rgba(255,255,255,.035)", borderColor: on ? pad.color : "rgba(255,255,255,.08)", boxShadow: on ? `0 0 10px ${pad.color}80` : undefined }} />)}</div>)}</div></section></div>; }
function Sampler({ log, assign }: { log: (m: string) => void; assign: () => void }) { return <div className="h-full overflow-auto bg-[#111418] p-4"><Wave /><div className="mt-4 flex flex-wrap gap-3"><Button onClick={() => log("Auto chop created six transient markers.")} active>Auto Chop</Button><Button onClick={() => log("Extracted six one-shots into the preview rack.")}>Extract One-Shots</Button><Button onClick={assign}>Assign To Pad</Button><Button onClick={() => log("Saved sample to My Sounds.")}>Save To My Sounds</Button></div></div>; }
function Wave({ compact = false }: { compact?: boolean }) { return <div className={cn("relative overflow-hidden border border-cyan-300/20 bg-black/60", compact ? "mt-2 h-12" : "h-56")}><div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.055)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.045)_1px,transparent_1px)] bg-[size:100%_32px,48px_100%]" /><svg viewBox="0 0 128 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">{wave.map((peak, i) => <rect key={i} x={i} y={50 - peak * 42} width="0.6" height={Math.max(1, peak * 84)} fill={i < 88 ? "#20f7ff" : "#ff31df"} opacity=".86" />)}</svg><div className="absolute left-[45%] top-0 h-full w-px bg-cyan-300 shadow-[0_0_18px_#20f7ff]" /></div>; }
function Piano() { return <div className="h-full overflow-hidden bg-[#111418] p-4"><div className="mb-3 flex flex-wrap gap-2"><Button active>Quantize</Button><Button active>Snap</Button><Button>Duplicate</Button><Button>Delete</Button><Button>Humanize</Button><span className="ml-auto text-[10px] uppercase text-cyan-200">Scale: C Minor</span></div><div className="grid h-[calc(100%-42px)] min-h-[480px] grid-cols-[90px_1fr] overflow-hidden border border-white/12 bg-black/35"><div className="grid" style={{ gridTemplateRows: `repeat(${notes.length},1fr)` }}>{notes.map((n) => <div key={n} className="border-b border-black/70 bg-white pr-2 text-right font-mono text-[10px] text-black">{n}</div>)}</div><div className="relative overflow-auto bg-[#101314] bg-[linear-gradient(rgba(255,255,255,.065)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.06)_1px,transparent_1px)] bg-[size:100%_32px,48px_100%]">{Array.from({ length: 18 }, (_, i) => <span key={i} className="absolute h-6 rounded-sm bg-cyan-300 px-2 text-[9px] font-black text-black" style={{ left: `${(i * 7) % 78}%`, top: `${(i % notes.length) * 32 + 9}px`, width: `${8 + (i % 3) * 4}%` }}>{notes[i % notes.length].replace(/[0-9]/g, "")}</span>)}</div></div></div>; }
function Sounds({ assignSound, selected }: { assignSound: (s: string) => void; selected: string }) { const [q, setQ] = useState(""); const filtered = sounds.filter((s) => `${s.name} ${s.target} ${s.label}`.toLowerCase().includes(q.toLowerCase())); return <div className="h-full overflow-auto bg-[#111418] p-4"><div className="mb-4 flex gap-3"><h2 className="text-3xl font-black uppercase text-cyan-200">My Sounds</h2><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sounds..." className="min-w-[260px] flex-1 border border-cyan-300/50 bg-black/45 px-5 text-sm outline-none" /><span className="text-xs uppercase text-white/50">Selected {selected}</span></div><div className="grid grid-cols-1 gap-4 overflow-auto sm:grid-cols-2 xl:grid-cols-3">{filtered.map((sound) => <button key={sound.name} onClick={() => assignSound(sound.name)} className="border border-white/12 bg-[#191c1e] p-4 text-left"><Wave compact /><b className="mt-3 block text-[12px] uppercase">{sound.name}</b><p className="mt-2 text-[10px] uppercase text-white/45">Routes to {sound.target.toUpperCase()} pad.</p></button>)}</div></div>; }
function Mixer({ pads, updatePad, applyPreset }: { pads: Pad[]; updatePad: (id: string, patch: Partial<Pad>) => void; applyPreset: (preset: Preset) => void }) { return <div className="grid h-full min-h-0 gap-3 overflow-hidden bg-[#111418] p-4 xl:grid-cols-[1fr_260px]"><section className="overflow-auto"><div className="grid min-w-[900px] grid-cols-8 gap-3">{pads.map((pad) => <div key={pad.id} className="border border-white/10 bg-black/28 p-3"><b className="block text-center text-[11px] uppercase">{pad.label}</b><div className="mt-4 flex h-64 items-end justify-center gap-2"><div className="relative h-full w-3 rounded bg-white/10"><span className="absolute bottom-0 left-0 right-0 rounded" style={{ height: `${pad.volume}%`, backgroundColor: pad.color }} /></div><input className="h-64 w-12 accent-cyan-300 [writing-mode:vertical-lr]" type="range" min="0" max="100" value={pad.volume} onChange={(e) => updatePad(pad.id, { volume: Number(e.target.value) })} /></div><input className="mt-3 w-full accent-pink-300" type="range" min="-50" max="50" value={pad.pan} onChange={(e) => updatePad(pad.id, { pan: Number(e.target.value) })} /><div className="mt-2 flex gap-1"><Button onClick={() => updatePad(pad.id, { muted: !pad.muted })} active={pad.muted}>M</Button><Button onClick={() => updatePad(pad.id, { solo: !pad.solo })} active={pad.solo}>S</Button></div></div>)}</div></section><section className="overflow-auto border-l border-white/10 pl-3">{presets.map((preset) => <button key={preset.name} onClick={() => applyPreset(preset)} className="mb-2 w-full border border-white/10 bg-black/25 p-3 text-left"><b style={{ color: preset.color }}>{preset.name}</b><p className="text-xs text-white/45">Real fader and pan changes.</p></button>)}</section></div>; }
function Arrange({ pads, step, toggleStep }: { pads: Pad[]; step: number; toggleStep: (id: string, i: number) => void }) { return <div className="h-full overflow-auto bg-[#111418] p-4"><div className="min-w-[960px] space-y-2">{pads.map((pad) => <div key={pad.id} className="grid items-center gap-2" style={{ gridTemplateColumns: "90px repeat(16,1fr)" }}><b className="text-xs" style={{ color: pad.color }}>{pad.label}</b>{pad.steps.map((on, i) => <button key={i} onClick={() => toggleStep(pad.id, i)} className="h-12 border border-white/10" style={{ background: on ? pad.color : i === step ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.035)" }} />)}</div>)}</div></div>; }
function Export({ patternText, exportSession, sendToStudio, messages }: { patternText: string; exportSession: (k: "json" | "midi" | "stems") => void; sendToStudio: () => void; messages: string[] }) { return <div className="grid h-full gap-3 overflow-hidden bg-[#111418] p-4 lg:grid-cols-[1fr_320px]"><section className="overflow-auto border border-white/10 bg-black/30 p-4"><h2 className="mb-4 text-2xl font-black uppercase text-cyan-200">Export</h2><div className="flex flex-wrap gap-3"><Button onClick={() => exportSession("json")} active>Session JSON</Button><Button onClick={() => exportSession("midi")}>MIDI Manifest</Button><Button onClick={() => exportSession("stems")}>Stems Manifest</Button><Button onClick={sendToStudio} active>Print To Studio</Button></div><pre className="mt-4 whitespace-pre-wrap border border-white/10 bg-black/40 p-3 text-xs text-white/60">{patternText}</pre></section><section className="overflow-auto border border-white/10 bg-black/30 p-4"><h3 className="mb-3 font-black uppercase text-white/60">History</h3>{messages.map((m, i) => <p key={i} className="border-b border-white/10 py-2 text-xs text-white/55">{m}</p>)}</section></div>; }
