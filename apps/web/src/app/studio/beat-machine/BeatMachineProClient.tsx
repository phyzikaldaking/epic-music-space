"use client";

import { useMemo, useState } from "react";

type BeatMachineView = "machine" | "sampler" | "piano" | "sounds" | "mixer" | "arrange" | "export";
type Pad = { name: string; color: string; key: string; group: string; active?: boolean };
type StepRow = { name: string; color: string; pattern: number[]; level: number; pan: number };
type SoundCard = { name: string; bpm: number; key: string; color: string; type: string };
type Preset = { name: string; style: string; target: string; color: string };

const pads: Pad[] = [
  { name: "KICK", color: "#20f7ff", key: "1", group: "drums", active: true },
  { name: "SNARE", color: "#20f7ff", key: "2", group: "drums" },
  { name: "HAT", color: "#a75cff", key: "3", group: "drums" },
  { name: "CLAP", color: "#a75cff", key: "4", group: "drums" },
  { name: "808", color: "#20f7ff", key: "Q", group: "bass" },
  { name: "PERC", color: "#20f7ff", key: "W", group: "drums" },
  { name: "RIM", color: "#a75cff", key: "E", group: "drums" },
  { name: "SHAKER", color: "#a75cff", key: "R", group: "drums" },
  { name: "TOM", color: "#20f7ff", key: "A", group: "drums" },
  { name: "CONGA", color: "#20f7ff", key: "S", group: "perc", active: true },
  { name: "BONGO", color: "#ff31df", key: "D", group: "perc" },
  { name: "MARIMBA", color: "#ff31df", key: "F", group: "melody" },
  { name: "VOX", color: "#20f7ff", key: "Z", group: "vocal" },
  { name: "FX", color: "#f2c85b", key: "X", group: "fx" },
  { name: "LOOP", color: "#f2c85b", key: "C", group: "loop" },
  { name: "CRASH", color: "#f2c85b", key: "V", group: "drums" },
];

const rows: StepRow[] = [
  { name: "kick", color: "#20f7ff", pattern: [1, 5, 9, 13], level: 86, pan: 0 },
  { name: "snare", color: "#ff31df", pattern: [5, 13], level: 74, pan: 0 },
  { name: "hat", color: "#20f7ff", pattern: [1, 3, 5, 7, 9, 11, 13, 15], level: 58, pan: 8 },
  { name: "808", color: "#f2c85b", pattern: [1, 4, 9, 12, 15], level: 82, pan: -4 },
  { name: "perc", color: "#a75cff", pattern: [3, 7, 10, 14], level: 64, pan: 14 },
  { name: "vox", color: "#16e59a", pattern: [8, 16], level: 69, pan: -10 },
  { name: "fx", color: "#20c8ff", pattern: [4, 12], level: 51, pan: 20 },
  { name: "loop", color: "#f2c85b", pattern: [1, 2, 3, 4, 9, 10, 11, 12], level: 72, pan: 0 },
];

const notes = [
  { pitch: "C6", start: 2, len: 3, color: "#20f7ff" },
  { pitch: "A5", start: 4, len: 2, color: "#b943ff" },
  { pitch: "F5", start: 1, len: 3, color: "#20f7ff" },
  { pitch: "D#5", start: 6, len: 2, color: "#b943ff" },
  { pitch: "C5", start: 8, len: 4, color: "#20f7ff" },
  { pitch: "A4", start: 12, len: 4, color: "#32f46a" },
  { pitch: "F4", start: 4, len: 7, color: "#32f46a" },
  { pitch: "D4", start: 10, len: 5, color: "#32f46a" },
  { pitch: "C4", start: 0, len: 2, color: "#b943ff" },
];

const soundCards: SoundCard[] = [
  { name: "HARD_KICK_01", bpm: 140, key: "C#m", color: "#f2c85b", type: "KICK" },
  { name: "DARK_SNARE_07", bpm: 129, key: "G#m", color: "#20f7ff", type: "SNARE" },
  { name: "DEEP_808_12", bpm: 152, key: "F", color: "#16e59a", type: "808" },
  { name: "VOCAL_BAD_05", bpm: 90, key: "G#m", color: "#ff31df", type: "VOX" },
  { name: "LOFI_MELODY_02", bpm: 85, key: "F", color: "#ff31df", type: "MELODY" },
  { name: "BRIGHT_CLAP_04", bpm: 160, key: "B", color: "#20c8ff", type: "CLAP" },
  { name: "MOODY_PAD_05", bpm: 90, key: "Am", color: "#ff31df", type: "PAD" },
  { name: "TRAP_PERC_HIT_62", bpm: 109, key: "Cm", color: "#16e59a", type: "PERC" },
  { name: "BRIGHT_CHOP_03", bpm: 118, key: "D", color: "#20c8ff", type: "CHOP" },
];

const presets: Preset[] = [
  { name: "Clean Radio Punch", style: "Modern clean", target: "Whole beat", color: "#20f7ff" },
  { name: "Trap Knock", style: "Hard 808 + crisp hats", target: "Drums + bass", color: "#f2c85b" },
  { name: "Vocal Sample Glue", style: "Warm chop blend", target: "Sampler", color: "#ff31df" },
  { name: "Lo-Fi Space", style: "Soft tape + width", target: "Music bus", color: "#16e59a" },
];

const chopCards = ["VOCAL_OOH", "VOCAL_AAH", "VOCAL_TAKE_01", "DRUM_SNARE", "LOOP_STAB", "BREATH_FX"];
const pianoKeys = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B", "C2", "C#2", "D2"];
const waveform = Array.from({ length: 130 }, (_, index) => Math.abs(Math.sin(index * 0.35) * Math.cos(index * 0.09)) * (index < 14 || index > 122 ? 0.14 : 1));

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("rounded-[18px] border border-white/12 bg-[#141719]/92 shadow-[inset_0_1px_0_rgba(255,255,255,.12),0_18px_50px_rgba(0,0,0,.38)]", className)}>{children}</section>;
}

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return <div className="flex h-10 items-center justify-between border-b border-white/10 px-4 text-[11px] font-black uppercase tracking-[0.12em] text-white/86"><span>{children}</span>{right}</div>;
}

function MicroButton({ children, active = false, onClick }: { children: React.ReactNode; active?: boolean; onClick?: () => void }) {
  return <button onClick={onClick} className={cn("rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] transition", active ? "border-cyan-300 bg-cyan-300 text-black shadow-[0_0_18px_rgba(32,247,255,.36)]" : "border-white/12 bg-white/[0.045] text-white/62 hover:border-cyan-300/50 hover:text-cyan-100")}>{children}</button>;
}

function Waveform({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("relative overflow-hidden rounded-xl border border-cyan-300/18 bg-black/58", compact ? "h-16" : "h-56")}>
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.055)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.045)_1px,transparent_1px)] bg-[size:100%_32px,48px_100%]" />
      <div className="absolute inset-x-0 top-1/2 h-px bg-cyan-200/35" />
      <svg viewBox="0 0 130 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <defs><linearGradient id="emsWave" x1="0" x2="1"><stop offset="0" stopColor="#20f7ff" /><stop offset="0.62" stopColor="#20f7ff" /><stop offset="1" stopColor="#ff31df" /></linearGradient></defs>
        {waveform.map((peak, index) => <rect key={index} x={index} y={50 - peak * 42} width="0.58" height={Math.max(1, peak * 84)} rx="0.3" fill="url(#emsWave)" opacity={0.88} />)}
        {[15, 25, 34, 48, 58, 72, 83, 94, 104, 113].map((x, i) => <line key={i} x1={x} x2={x} y1="8" y2="92" stroke={i % 2 ? "#f2c85b" : "#20f7ff"} strokeDasharray="1 2" opacity="0.65" />)}
      </svg>
      <div className="absolute left-[45%] top-0 h-full w-px bg-cyan-300 shadow-[0_0_18px_rgba(32,247,255,.9)]" />
      {!compact && <div className="absolute left-3 top-3 rounded-md border border-white/12 bg-black/65 px-2 py-1 font-mono text-[10px] text-white/62">VOCAL_HOOK_01.wav · 44.1kHz / 24-bit / KEY:Cm / BPM:87</div>}
    </div>
  );
}

function NeonPad({ pad, selected, onClick }: { pad: Pad; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group relative aspect-square overflow-hidden rounded-xl border bg-gradient-to-b from-[#2c2d2f] to-[#101112] p-3 text-left transition hover:-translate-y-0.5" style={{ borderColor: selected || pad.active ? pad.color : "rgba(255,255,255,.18)", boxShadow: selected || pad.active ? `0 0 22px ${pad.color}66, inset 0 0 20px ${pad.color}18` : "inset 0 1px 0 rgba(255,255,255,.08)" }}>
      <span className="absolute inset-x-3 top-3 h-px bg-white/18" />
      <span className="grid h-full place-items-center text-[13px] font-black tracking-[0.08em] text-white/88">{pad.name}</span>
      <span className="absolute bottom-2 left-2 text-[8px] uppercase tracking-[0.14em] text-white/34">{pad.group}</span>
      <span className="absolute bottom-2 right-2 font-mono text-[10px] text-white/42">{pad.key}</span>
    </button>
  );
}

function StepSequencer({ selectedPad }: { selectedPad: string }) {
  return (
    <Panel className="overflow-hidden">
      <SectionTitle right={<span className="font-mono text-cyan-200">140 BPM</span>}>Step Sequencer</SectionTitle>
      <div className="p-3">
        <div className="mb-2 grid gap-1 pl-20" style={{ gridTemplateColumns: "repeat(16,minmax(0,1fr))" }}>{Array.from({ length: 16 }, (_, i) => <span key={i} className="text-center font-mono text-[8px] text-white/38">{i + 1}</span>)}</div>
        <div className="space-y-1.5">{rows.map((row) => <div key={row.name} className="grid items-center gap-2" style={{ gridTemplateColumns: "70px 1fr" }}><span className={cn("truncate font-mono text-[10px] uppercase", selectedPad.toLowerCase().startsWith(row.name) ? "text-cyan-200" : "text-white/52")}>{row.name}</span><div className="grid gap-1" style={{ gridTemplateColumns: "repeat(16,minmax(0,1fr))" }}>{Array.from({ length: 16 }, (_, i) => { const on = row.pattern.includes(i + 1); return <button key={i} className="h-7 rounded-[4px] border border-white/8 bg-white/[0.035]" style={on ? { backgroundColor: row.color, boxShadow: `0 0 12px ${row.color}80`, borderColor: row.color } : undefined} />; })}</div></div>)}</div>
      </div>
    </Panel>
  );
}

function MiniPianoRoll() {
  return <Panel className="overflow-hidden"><SectionTitle>Piano Roll</SectionTitle><div className="grid h-[176px] grid-cols-[50px_1fr] p-3"><div className="grid grid-rows-8 overflow-hidden rounded-l-md border border-white/10 bg-black/40">{["C6", "B5", "A5", "G5", "F5", "E5", "D5", "C5"].map((key) => <div key={key} className="border-b border-black/50 bg-white pr-1 text-right font-mono text-[8px] text-black last:border-b-0">{key}</div>)}</div><div className="relative overflow-hidden rounded-r-md border border-l-0 border-white/10 bg-[#101314] bg-[linear-gradient(rgba(255,255,255,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.06)_1px,transparent_1px)] bg-[size:100%_23px,36px_100%]"><div className="absolute left-[50%] top-0 h-full w-px bg-cyan-300 shadow-[0_0_10px_#20f7ff]" />{notes.slice(0, 7).map((note, i) => <span key={i} className="absolute h-4 rounded-sm" style={{ left: `${note.start * 6}%`, top: `${(i + 1) * 19}px`, width: `${note.len * 5}%`, backgroundColor: note.color, boxShadow: `0 0 12px ${note.color}66` }} />)}</div></div></Panel>;
}

function AiPresetMixer() {
  return <Panel className="overflow-hidden"><SectionTitle right={<MicroButton active>Apply Mix</MicroButton>}>AI Preset Mixer</SectionTitle><div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-4">{presets.map((preset) => <button key={preset.name} className="rounded-xl border border-white/10 bg-black/28 p-3 text-left transition hover:border-cyan-300/50"><span className="mb-2 block h-1.5 rounded-full" style={{ backgroundColor: preset.color, boxShadow: `0 0 14px ${preset.color}` }} /><b className="block text-[12px] uppercase tracking-[0.08em] text-white/86">{preset.name}</b><span className="mt-1 block text-[10px] uppercase text-white/45">{preset.style}</span><span className="mt-3 inline-flex rounded-full border border-white/10 px-2 py-1 text-[9px] uppercase text-white/50">{preset.target}</span></button>)}</div></Panel>;
}

function MachineView({ selectedPad, setSelectedPad }: { selectedPad: string; setSelectedPad: (pad: string) => void }) {
  return <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden xl:grid-cols-[430px_180px_1fr]"><Panel className="overflow-auto p-3"><div className="mb-3 flex items-center justify-between px-1 font-mono text-[10px] uppercase text-white/45"><span>Pad Bank A · Velocity 92 · Swing 20%</span><span className="text-cyan-200">BPM: 140</span></div><div className="grid grid-cols-4 gap-3">{pads.map((pad) => <NeonPad key={pad.name} pad={pad} selected={selectedPad === pad.name} onClick={() => setSelectedPad(pad.name)} />)}</div></Panel><Panel className="overflow-auto p-3"><SectionTitle right={<span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_12px_#20f7ff]" />}>Per-Pad Controls</SectionTitle><div className="mt-4 space-y-4 px-1">{["Tune", "Pan", "Filter", "Decay", "Attack", "Pitch Env"].map((label, i) => <div key={label} className="flex items-center justify-between"><span className="text-[10px] font-black uppercase text-white/55">{label}</span><span className="grid h-10 w-10 place-items-center rounded-full border border-white/12 bg-[radial-gradient(circle_at_35%_35%,#f2c85b,#28200c_55%,#080808)] shadow-[inset_0_1px_0_rgba(255,255,255,.45)]"><span className="h-4 w-px origin-bottom rounded bg-black/70" style={{ transform: `rotate(${i * 22 - 36}deg)` }} /></span></div>)}<div className="rounded-xl border border-white/10 bg-black/30 p-3"><p className="mb-2 text-[10px] font-black uppercase text-cyan-100">Pad Actions</p><div className="grid gap-2"><MicroButton>Assign Sample</MicroButton><MicroButton>Normalize</MicroButton><MicroButton>Reverse</MicroButton><MicroButton active>Choke Group</MicroButton></div></div></div></Panel><div className="grid min-h-0 gap-3 overflow-hidden"><StepSequencer selectedPad={selectedPad} /><MiniPianoRoll /><AiPresetMixer /></div></div>;
}

function SamplerView() {
  return <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr] gap-3 overflow-hidden"><Panel className="overflow-hidden p-4"><Waveform /><div className="mt-4 flex flex-wrap items-center gap-3"><MicroButton active>Auto Chop</MicroButton><MicroButton>Extract One-Shots</MicroButton><MicroButton>Save To My Sounds</MicroButton><MicroButton>Assign To Pad</MicroButton><MicroButton>Send To Timeline</MicroButton><MicroButton>Warp</MicroButton><MicroButton>Key/BPM Detect</MicroButton><span className="ml-auto text-[10px] uppercase tracking-[0.12em] text-white/45">Transient mode · 24-bit · 6 markers detected</span></div></Panel><div className="grid min-h-0 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-3"><Panel className="overflow-auto p-4"><SectionTitle>One-Shot Preview Cards</SectionTitle><div className="mt-4 space-y-3">{chopCards.map((name, i) => <div key={name} className="flex items-center gap-3 rounded-xl border border-cyan-300/45 bg-black/32 p-3"><span className="grid h-12 w-12 place-items-center rounded-md border border-cyan-300/40 bg-cyan-300/10"><span className="h-4 w-8 rounded-full bg-cyan-300/70" /></span><span className="min-w-0 flex-1"><b className="block truncate text-sm text-white/86">{name}</b><span className="font-mono text-[10px] text-white/45">BPM:87 / KEY:Cm / 0:0{i + 1}.234s</span></span><span className="text-white/42">☰</span></div>)}</div></Panel><Panel className="overflow-auto p-4"><SectionTitle>AI Suggestions / Smart Extract</SectionTitle><div className="mt-4 grid grid-cols-3 gap-2">{["Vocal Ooh", "Down Loop", "Tail FX"].map((name) => <div key={name} className="rounded-lg border border-fuchsia-400/50 bg-fuchsia-400/8 p-3"><Waveform compact /><p className="mt-2 truncate text-[9px] uppercase text-fuchsia-100/75">{name}</p></div>)}</div><div className="mt-5 space-y-4 text-[11px] text-white/62"><div className="flex justify-between"><span>Sample Rate</span><b className="text-cyan-200">44.1kHz</b></div><div className="flex justify-between"><span>Chop Mode</span><b className="text-cyan-200">Transient 24-bit</b></div><div><div className="mb-1 flex justify-between"><span>Threshold</span><b>9%</b></div><div className="h-1.5 rounded bg-white/10"><div className="h-full w-2/3 rounded bg-[#f2c85b]" /></div></div><MicroButton active>Extract Stems</MicroButton></div></Panel><Panel className="overflow-auto p-4"><SectionTitle>Sample Info / Keyboard</SectionTitle><div className="mt-6 grid grid-cols-[repeat(15,minmax(0,1fr))] gap-0 overflow-hidden rounded-lg border border-white/10">{pianoKeys.map((key) => <span key={key} className={cn("h-16 border-r border-black/40 text-center text-[8px] text-black last:border-r-0", key.includes("#") ? "bg-black text-white" : "bg-white", key === "C#" && "!bg-cyan-300", key === "G#" && "!bg-fuchsia-400", key === "A" && "!bg-[#f2c85b]")}>{key}</span>)}</div><div className="mt-6 space-y-2 text-center text-[11px] uppercase text-white/55"><p>Root Note: <b className="text-white">C3</b></p><p>Key: <b className="text-white">Cm (92%)</b></p><p>BPM: <b className="text-white">87.0 (98%)</b></p><p>Warp Mode: <b className="text-white">Pro</b></p></div></Panel></div></div>;
}

function PianoView() {
  const pitches = ["C6", "B5", "A#5", "A5", "G5", "F#5", "F5", "E5", "D5", "C5", "B4", "A4", "G4", "F4", "E4", "D4", "C4"];
  return <Panel className="min-h-0 flex-1 overflow-hidden p-4"><div className="mb-3 flex flex-wrap items-center gap-2"><MicroButton active>Quantize</MicroButton><MicroButton active>Snap</MicroButton><MicroButton>Sharp</MicroButton><MicroButton>Duplicate</MicroButton><MicroButton>Delete</MicroButton><MicroButton>Undo</MicroButton><MicroButton>Velocity</MicroButton><MicroButton>Strum</MicroButton><MicroButton>Humanize</MicroButton><span className="ml-auto text-[10px] uppercase text-cyan-200">Scale: C Minor</span></div><div className="grid h-[calc(100dvh-190px)] min-h-[560px] grid-cols-[96px_1fr] overflow-hidden rounded-2xl border border-white/12 bg-black/35"><div className="grid" style={{ gridTemplateRows: `repeat(${pitches.length},minmax(0,1fr))` }}>{pitches.map((pitch) => <div key={pitch} className="border-b border-black/70 bg-white pr-2 text-right font-mono text-[10px] text-black last:border-b-0">{pitch}</div>)}</div><div className="relative overflow-auto bg-[#101314] bg-[linear-gradient(rgba(255,255,255,.065)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.06)_1px,transparent_1px)] bg-[size:100%_32px,48px_100%]"><div className="absolute left-[47%] top-0 h-full w-px bg-cyan-300 shadow-[0_0_18px_#20f7ff]" /><div className="absolute left-[72%] top-0 h-full w-px bg-rose-400 shadow-[0_0_18px_rgba(251,113,133,.7)]" />{notes.concat(notes.map((n, i) => ({ ...n, start: n.start + 8, color: i % 2 ? "#32f46a" : n.color }))).map((note, i) => <span key={i} className="absolute h-6 rounded-sm px-2 text-[9px] font-black text-black" style={{ left: `${note.start * 6}%`, top: `${(i % pitches.length) * 32 + 9}px`, width: `${note.len * 6}%`, backgroundColor: note.color, boxShadow: `0 0 16px ${note.color}75` }}>{note.pitch.replace(/[0-9]/g, "")}</span>)}<div className="absolute bottom-0 left-0 right-0 h-24 border-t border-white/12 bg-black/45 p-3"><div className="mb-2 text-[10px] uppercase text-white/55">Velocity</div><div className="flex h-12 items-end gap-1">{Array.from({ length: 48 }, (_, i) => <span key={i} className="w-2 rounded-t bg-cyan-300" style={{ height: `${10 + ((i * 7) % 38)}px`, opacity: i % 5 ? 0.75 : 1 }} />)}</div></div></div></div></Panel>;
}

function SoundsView() {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => soundCards.filter((sound) => sound.name.toLowerCase().includes(query.toLowerCase()) || sound.type.toLowerCase().includes(query.toLowerCase())), [query]);
  return <Panel className="min-h-0 flex-1 overflow-hidden p-4"><div className="mb-4 flex flex-wrap items-center gap-3"><div><p className="text-[12px] font-black uppercase tracking-[0.18em] text-cyan-300">EMS Smart Studio</p><h2 className="text-3xl font-black uppercase tracking-tight text-cyan-200">My Sounds</h2></div><label className="min-w-[260px] flex-1 rounded-full border border-cyan-300/60 bg-black/45 px-5 py-3 shadow-[0_0_22px_rgba(32,247,255,.18)]"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sounds, kits, loops..." className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/42" /></label><MicroButton active>Upload</MicroButton><MicroButton>Save Custom Kit</MicroButton></div><div className="mb-4 flex gap-2 overflow-x-auto pb-1">{["All", "Kick", "Snares 75", "Hats 75", "Percs 60", "Melodies 25", "Extracted One-Shots", "Vocals", "Co-Producer"].map((filter, i) => <MicroButton key={filter} active={i === 1}>{filter}</MicroButton>)}</div><div className="grid min-h-0 gap-4 overflow-hidden lg:grid-cols-[1fr_260px]"><div className="grid max-h-[calc(100dvh-240px)] grid-cols-1 gap-4 overflow-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">{filtered.map((sound) => <div key={sound.name} className="rounded-2xl border border-white/12 bg-[#191c1e] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.08)]"><div className="mb-5 grid h-24 place-items-center rounded-xl bg-black/24"><span className="h-12 w-32 rounded-lg" style={{ backgroundColor: sound.color, boxShadow: `0 0 22px ${sound.color}55` }}><Waveform compact /></span></div><p className="truncate text-[12px] font-black uppercase text-white/86">{sound.name}</p><div className="mt-2 flex flex-wrap gap-2 font-mono text-[10px]"><span className="rounded bg-[#f2c85b] px-2 py-0.5 text-black">{sound.bpm}</span><span className="rounded bg-white/12 px-2 py-0.5 text-white/70">{sound.key}</span><span className="rounded bg-violet-500 px-2 py-0.5 text-white">{sound.type}</span></div></div>)}</div><aside className="rounded-2xl border border-white/12 bg-black/32 p-5"><h3 className="text-sm font-black uppercase text-white/82">Upload / Save</h3><button className="mt-4 w-full rounded-lg border border-cyan-300 bg-cyan-300/10 py-3 text-sm font-black uppercase text-cyan-200">Upload</button><button className="mt-3 w-full rounded-lg border border-[#f2c85b] bg-[#f2c85b]/10 py-3 text-sm font-black uppercase text-[#f2c85b]">Save Custom Kit</button><div className="mt-6 text-[11px] uppercase text-white/52"><p>Cloud Saved</p><div className="mt-2 h-1.5 rounded bg-white/10"><div className="h-full w-1/3 rounded bg-cyan-300" /></div><p className="mt-2">2.4 GB / 10 GB used</p></div><div className="mt-8 space-y-3 text-[11px] text-white/58"><b className="block text-white/80">Recently Added</b><p>HARD_KICK_01 · 15 min ago</p><p>DARK_CHOP_03 · 15 min ago</p><p>BRIGHT_CLAP_04 · 22 min ago</p></div></aside></div></Panel>;
}

function MixerView() {
  return <div className="grid min-h-0 flex-1 gap-3 overflow-hidden xl:grid-cols-[1fr_360px]"><Panel className="overflow-auto p-4"><SectionTitle right={<MicroButton active>AI Balance</MicroButton>}>Beat Machine Mixer</SectionTitle><div className="mt-4 grid min-w-[900px] grid-cols-8 gap-3">{rows.map((row) => <div key={row.name} className="rounded-2xl border border-white/10 bg-black/28 p-3"><b className="block text-center text-[11px] uppercase text-white/75">{row.name}</b><div className="mt-4 flex h-64 items-end justify-center gap-2"><div className="relative h-full w-3 rounded bg-white/10"><span className="absolute bottom-0 left-0 right-0 rounded bg-gradient-to-t from-green-400 via-cyan-300 to-[#f2c85b]" style={{ height: `${row.level}%` }} /></div><div className="relative h-full w-12 rounded-xl border border-white/10 bg-[#111]"><span className="absolute left-2 right-2 rounded bg-white/70" style={{ bottom: `${row.level}%`, height: 8 }} /></div></div><div className="mt-3 text-center font-mono text-[10px] text-white/45">{row.level} dB · Pan {row.pan}</div></div>)}</div></Panel><Panel className="overflow-auto p-4"><SectionTitle>Bus Processing</SectionTitle><div className="mt-4 space-y-3">{["EQ Curve", "Compressor", "Saturation", "Limiter", "Stereo Width", "Reference Match"].map((item, i) => <div key={item} className="rounded-xl border border-white/10 bg-black/25 p-3"><div className="mb-2 flex justify-between text-[11px] uppercase text-white/60"><span>{item}</span><b>{i % 2 ? "ON" : "AUTO"}</b></div><div className="h-1.5 rounded bg-white/10"><div className="h-full rounded bg-cyan-300" style={{ width: `${45 + i * 7}%` }} /></div></div>)}</div></Panel></div>;
}

function ArrangeView() {
  return <Panel className="min-h-0 flex-1 overflow-hidden p-4"><SectionTitle right={<span className="font-mono text-cyan-200">Timeline · 4 bars · Loop on</span>}>Arrangement / Pattern Timeline</SectionTitle><div className="mt-4 grid h-[calc(100dvh-190px)] min-h-[520px] grid-cols-[120px_1fr] overflow-auto rounded-2xl border border-white/10 bg-black/30"><div>{rows.map((row) => <div key={row.name} className="flex h-16 items-center border-b border-white/8 px-3 text-[11px] uppercase text-white/62">{row.name}</div>)}</div><div className="relative min-w-[980px] bg-[linear-gradient(90deg,rgba(255,255,255,.075)_1px,transparent_1px),linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px)] bg-[size:64px_100%,100%_64px]"><div className="absolute left-[42%] top-0 h-full w-px bg-cyan-300 shadow-[0_0_18px_#20f7ff]" />{rows.map((row, rowIndex) => row.pattern.slice(0, 6).map((step, i) => <div key={`${row.name}-${step}-${i}`} className="absolute h-10 rounded-lg border border-white/10" style={{ left: `${step * 5.5}%`, top: rowIndex * 64 + 12, width: `${8 + (i % 3) * 4}%`, backgroundColor: row.color, boxShadow: `0 0 16px ${row.color}55` }} />))}</div></div></Panel>;
}

function ExportView() {
  return <div className="grid min-h-0 flex-1 gap-3 overflow-auto lg:grid-cols-3"><Panel className="p-4"><SectionTitle>Export Beat</SectionTitle><div className="mt-4 space-y-3"><MicroButton active>Export WAV 24-bit</MicroButton><MicroButton>Export Stems</MicroButton><MicroButton>Export MIDI</MicroButton><MicroButton>Send To Studio Timeline</MicroButton><MicroButton>Save Pattern</MicroButton></div></Panel><Panel className="p-4"><SectionTitle>Session Checklist</SectionTitle><div className="mt-4 space-y-3 text-sm text-white/65"><p>✓ Pads assigned</p><p>✓ Pattern generated</p><p>✓ Piano roll notes ready</p><p>✓ AI preset mix selected</p><p>✓ Stem export ready</p></div></Panel><Panel className="p-4"><SectionTitle>Quality Target</SectionTitle><div className="mt-4 space-y-3 text-sm text-white/65"><p>Loudness: -10 LUFS preview</p><p>Peak: -1.0 dBTP</p><p>Sample rate: 48 kHz</p><p>Bit depth: 24-bit</p><p>Format: WAV + Stems + MIDI</p></div></Panel></div>;
}

export default function BeatMachineProClient({ initialView = "machine", studioMode = false }: { initialView?: BeatMachineView; studioMode?: boolean }) {
  const [view, setView] = useState<BeatMachineView>(initialView);
  const [selectedPad, setSelectedPad] = useState("KICK");
  const views: { id: BeatMachineView; label: string }[] = [
    { id: "machine", label: "Beat Machine" },
    { id: "sampler", label: "Sampler" },
    { id: "piano", label: "Piano Roll" },
    { id: "sounds", label: "Sounds" },
    { id: "mixer", label: "Mixer" },
    { id: "arrange", label: "Arrange" },
    { id: "export", label: "Export" },
  ];

  return <div className="h-dvh overflow-hidden bg-[#070808] text-white [background-image:radial-gradient(circle_at_top,rgba(32,247,255,.12),transparent_34%),linear-gradient(135deg,rgba(255,255,255,.035)_25%,transparent_25%),linear-gradient(45deg,rgba(255,255,255,.025)_25%,transparent_25%)] [background-size:auto,18px_18px,18px_18px]"><div className="mx-auto flex h-full max-w-[1680px] flex-col gap-3 p-3"><header className="shrink-0 rounded-[22px] border border-white/12 bg-[#111416]/96 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,.12),0_16px_40px_rgba(0,0,0,.42)]"><div className="flex flex-wrap items-center gap-3"><div className="mr-2 min-w-[220px] rounded-xl border border-white/12 bg-black/25 px-4 py-2"><span className="text-2xl font-black tracking-tight text-cyan-300">EMS</span><span className="ml-2 text-sm font-medium text-white/82">{studioMode ? "Studio Beat Machine" : "Smart Studio"}</span></div><nav className="flex flex-wrap gap-2">{views.map((item) => <button key={item.id} onClick={() => setView(item.id)} className={cn("rounded-lg border px-4 py-2 text-[11px] font-black uppercase tracking-[0.12em] transition", view === item.id ? "border-cyan-300 bg-cyan-300 text-black shadow-[0_0_18px_rgba(32,247,255,.45)]" : "border-white/12 bg-white/[0.04] text-white/62 hover:border-cyan-300/50 hover:text-cyan-100")}>{item.label}</button>)}</nav><div className="ml-auto flex items-center gap-2"><MicroButton>Preview</MicroButton><MicroButton>Loop</MicroButton><MicroButton>Key/BPM Detect</MicroButton><MicroButton active>AI Mix</MicroButton></div></div></header><main className="min-h-0 flex flex-1 overflow-hidden">{view === "machine" && <MachineView selectedPad={selectedPad} setSelectedPad={setSelectedPad} />}{view === "sampler" && <SamplerView />}{view === "piano" && <PianoView />}{view === "sounds" && <SoundsView />}{view === "mixer" && <MixerView />}{view === "arrange" && <ArrangeView />}{view === "export" && <ExportView />}</main></div></div>;
}
