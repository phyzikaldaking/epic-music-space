"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { scheduleDrumHit, type DrumKind, type DrumKitId } from "@/components/daw/beatMachine";

type Mode = "studio" | "edit" | "mix" | "beat" | "collab" | "export";
type TrackKind = "audio" | "drum" | "melody" | "bass" | "vocal" | "fx";

type StudioTrack = {
  id: string;
  name: string;
  kind: TrackKind;
  color: string;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  armed: boolean;
  meter: number;
};

const DEFAULT_KIT: DrumKitId = "trap";
const TRACK_COLORS = ["#17fff4", "#ff34df", "#f6d63d", "#42ff56", "#a855ff", "#ff7a2f", "#23d4ff", "#ff4f8b"];
const INITIAL_TRACKS: StudioTrack[] = [
  { id: "lead", name: "Lead Vox", kind: "vocal", color: "#ff34df", volume: 74, pan: 0, muted: false, solo: false, armed: true, meter: 72 },
  { id: "drums", name: "Drums", kind: "drum", color: "#17fff4", volume: 82, pan: 0, muted: false, solo: false, armed: false, meter: 88 },
  { id: "bass", name: "808 Bass", kind: "bass", color: "#f6d63d", volume: 68, pan: -8, muted: false, solo: false, armed: false, meter: 61 },
  { id: "keys", name: "Keys", kind: "melody", color: "#42ff56", volume: 63, pan: 12, muted: false, solo: false, armed: false, meter: 54 },
  { id: "pad", name: "Atmos Pad", kind: "melody", color: "#a855ff", volume: 58, pan: 16, muted: false, solo: false, armed: false, meter: 49 },
  { id: "hook", name: "Hook Stack", kind: "vocal", color: "#ff7a2f", volume: 70, pan: -14, muted: false, solo: false, armed: false, meter: 66 },
  { id: "fx", name: "FX", kind: "fx", color: "#23d4ff", volume: 52, pan: 20, muted: false, solo: false, armed: false, meter: 37 },
  { id: "master", name: "Master", kind: "audio", color: "#ff4f8b", volume: 80, pan: 0, muted: false, solo: false, armed: false, meter: 78 },
];

const MODES: { id: Mode; label: string }[] = [
  { id: "studio", label: "Studio" },
  { id: "edit", label: "Edit" },
  { id: "mix", label: "Mix" },
  { id: "beat", label: "Beat" },
  { id: "collab", label: "Collab" },
  { id: "export", label: "Export" },
];

const PADS: { label: string; kind: DrumKind; color: string }[] = [
  { label: "KICK", kind: "kick", color: "#17fff4" },
  { label: "SNARE", kind: "snare", color: "#ff34df" },
  { label: "CLAP", kind: "clap", color: "#f6d63d" },
  { label: "HAT", kind: "hat", color: "#42ff56" },
  { label: "OPEN", kind: "openHat", color: "#a855ff" },
  { label: "PERC", kind: "perc", color: "#ff7a2f" },
  { label: "808", kind: "bass808", color: "#23d4ff" },
  { label: "CRASH", kind: "crash", color: "#ff4f8b" },
];

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
}

export default function ElectricStudio() {
  const [mode, setMode] = useState<Mode>("studio");
  const [playing, setPlaying] = useState(false);
  const [bpm, setBpm] = useState(92);
  const [tracks, setTracks] = useState<StudioTrack[]>(INITIAL_TRACKS);
  const [selectedTrack, setSelectedTrack] = useState("lead");
  const [activePad, setActivePad] = useState<string | null>(null);
  const [bar, setBar] = useState(37);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const playingRef = useRef(false);

  useEffect(() => { playingRef.current = playing; }, [playing]);

  function getCtx() {
    if (ctxRef.current && ctxRef.current.state !== "closed") return ctxRef.current;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor({ latencyHint: "interactive", sampleRate: 48000 });
    const gain = ctx.createGain();
    gain.gain.value = 0.82;
    gain.connect(ctx.destination);
    ctxRef.current = ctx;
    masterRef.current = gain;
    return ctx;
  }

  function togglePlay() {
    const ctx = getCtx();
    if (ctx.state === "suspended") void ctx.resume();
    setPlaying((p) => !p);
  }

  function firePad(kind: DrumKind, label: string) {
    const ctx = getCtx();
    if (ctx.state === "suspended") void ctx.resume();
    scheduleDrumHit(ctx, masterRef.current ?? ctx.destination, kind, { kit: DEFAULT_KIT, when: ctx.currentTime, velocity: 0.9 });
    setActivePad(label);
    window.setTimeout(() => setActivePad(null), 120);
  }

  function updateTrack(id: string, patch: Partial<StudioTrack>) {
    setTracks((current) => current.map((track) => track.id === id ? { ...track, ...patch } : track));
  }

  function addTrack(kind: TrackKind = "melody") {
    const index = tracks.length + 1;
    const color = TRACK_COLORS[index % TRACK_COLORS.length];
    const track: StudioTrack = {
      id: `track-${Date.now()}`,
      name: kind === "melody" ? `Melody ${index}` : kind === "drum" ? `Drum ${index}` : `Track ${index}`,
      kind,
      color,
      volume: 62,
      pan: 0,
      muted: false,
      solo: false,
      armed: kind === "melody",
      meter: 45,
    };
    setTracks((current) => [...current.filter((t) => t.id !== "master"), track, current.find((t) => t.id === "master")!]);
    setSelectedTrack(track.id);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        togglePlay();
      }
      const pad = PADS[Number(e.key) - 1];
      if (pad) firePad(pad.kind, pad.label);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tracks.length]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setBar((b) => (b >= 128 ? 1 : b + 1));
      setTracks((current) => current.map((t, i) => ({ ...t, meter: Math.max(16, Math.min(98, t.muted ? 8 : 35 + ((Date.now() / 65 + i * 19) % 56))) })));
    }, 160);
    return () => window.clearInterval(id);
  }, [playing]);

  useEffect(() => () => { ctxRef.current?.close().catch(() => undefined); }, []);

  const selected = useMemo(() => tracks.find((t) => t.id === selectedTrack) ?? tracks[0], [tracks, selectedTrack]);

  return (
    <main id="main-content" data-ems-workspace data-studio-content className="fixed inset-0 overflow-hidden bg-[#05070a] text-white">
      <div className="absolute inset-0 opacity-70 [background:radial-gradient(circle_at_20%_20%,rgba(0,255,244,.14),transparent_28%),radial-gradient(circle_at_80%_40%,rgba(255,52,223,.13),transparent_30%),linear-gradient(135deg,#06070b,#0e1117_45%,#050609)]" />
      <div className="relative mx-auto flex h-full max-w-[1600px] flex-col p-2 sm:p-3">
        <TopBar playing={playing} bpm={bpm} bar={bar} setBpm={setBpm} togglePlay={togglePlay} />
        <div className="mt-2 grid min-h-0 flex-1 grid-cols-[66px_1fr] gap-2 rounded-[22px] border border-white/15 bg-[#10151a]/92 p-2 shadow-[0_0_70px_rgba(0,245,255,.16)] ring-1 ring-cyan-300/15">
          <SideRail mode={mode} setMode={setMode} />
          <section className="grid min-h-0 grid-rows-[38%_1fr_23%] gap-2 overflow-hidden">
            <Timeline tracks={tracks} selectedTrack={selectedTrack} setSelectedTrack={setSelectedTrack} playing={playing} bar={bar} />
            <div className="grid min-h-0 grid-cols-[250px_1fr_210px] gap-2 overflow-hidden">
              <Inspector selected={selected} updateTrack={updateTrack} />
              {(mode === "studio" || mode === "mix") && <Mixer tracks={tracks} selectedTrack={selectedTrack} setSelectedTrack={setSelectedTrack} updateTrack={updateTrack} />}
              {mode === "edit" && <EditPanel tracks={tracks} />}
              {mode === "beat" && <BeatPanel activePad={activePad} firePad={firePad} addTrack={addTrack} />}
              {(mode === "collab" || mode === "export") && <UtilityPanel mode={mode} />}
              <FxRack selected={selected} />
            </div>
            <BottomComposer activePad={activePad} firePad={firePad} addTrack={addTrack} />
          </section>
        </div>
      </div>
    </main>
  );
}

function TopBar({ playing, bpm, bar, setBpm, togglePlay }: { playing: boolean; bpm: number; bar: number; setBpm: (fn: (b: number) => number) => void; togglePlay: () => void }) {
  return <header className="relative flex h-[54px] shrink-0 items-center gap-2 rounded-2xl border border-white/12 bg-[#151a20]/95 px-3 shadow-[inset_0_0_18px_rgba(255,255,255,.04)]">
    <Link href="/" className="grid h-9 w-9 place-items-center rounded-lg border border-cyan-300/35 bg-cyan-300/10 text-cyan-200">⌂</Link>
    <div className="hidden rounded-md border border-white/10 bg-black/45 px-2 py-1 text-[10px] uppercase tracking-widest text-white/55 sm:block">EMS DAW</div>
    <div className="mx-2 h-5 flex-1 rounded-sm border border-white/10 bg-black/60 p-1"><div className="h-full rounded-sm bg-cyan-300 shadow-[0_0_18px_#17fff4]" style={{ width: `${Math.min(100, bar / 1.28)}%` }} /></div>
    <button onClick={togglePlay} className={`h-9 w-9 rounded-full border text-xs font-black ${playing ? "border-pink-300 bg-pink-500/20 text-pink-100 shadow-[0_0_18px_rgba(255,52,223,.6)]" : "border-cyan-300 bg-cyan-300/15 text-cyan-100 shadow-[0_0_18px_rgba(23,255,244,.45)]"}`}>{playing ? "■" : "▶"}</button>
    <button className="h-9 rounded-full border border-cyan-300/35 px-3 text-[10px] font-black uppercase tracking-widest text-cyan-100">Loop</button>
    <button className="h-9 rounded-full border border-yellow-300/35 px-3 text-[10px] font-black uppercase tracking-widest text-yellow-100">Rec</button>
    <div className="flex h-9 items-center rounded-full border border-white/10 bg-black/45 px-2">
      <button onClick={() => setBpm((b) => Math.max(60, b - 1))} className="h-6 w-6 rounded-full bg-white/5">−</button>
      <span className="w-11 text-center font-mono text-sm font-black text-cyan-100">{bpm}</span>
      <button onClick={() => setBpm((b) => Math.min(180, b + 1))} className="h-6 w-6 rounded-full bg-white/5">+</button>
    </div>
  </header>;
}

function SideRail({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return <aside className="flex min-h-0 flex-col items-center gap-2 rounded-xl border border-white/10 bg-black/45 p-2">
    {MODES.map((item) => <button key={item.id} onClick={() => setMode(item.id)} className={`w-full rounded-lg border px-1 py-2 text-[9px] font-black uppercase tracking-widest transition ${mode === item.id ? "border-cyan-300 bg-cyan-300/18 text-cyan-100 shadow-[0_0_18px_rgba(23,255,244,.35)]" : "border-white/10 bg-white/[.03] text-white/45 hover:text-white"}`}>{item.label}</button>)}
  </aside>;
}

function Timeline({ tracks, selectedTrack, setSelectedTrack, playing, bar }: { tracks: StudioTrack[]; selectedTrack: string; setSelectedTrack: (id: string) => void; playing: boolean; bar: number }) {
  return <section className="relative min-h-0 overflow-hidden rounded-xl border border-white/12 bg-[#071015] shadow-[inset_0_0_30px_rgba(0,245,255,.05)]">
    <div className="absolute inset-0 opacity-45 [background-image:linear-gradient(rgba(255,255,255,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.07)_1px,transparent_1px)] [background-size:42px_28px]" />
    <div className="absolute left-[12%] top-0 h-full w-px bg-yellow-300 shadow-[0_0_22px_#f6d63d]" style={{ left: `${Math.min(96, bar / 1.32)}%` }} />
    <div className="relative z-[1] flex h-7 items-center border-b border-white/10 px-3 text-[10px] uppercase tracking-widest text-white/45">
      {Array.from({ length: 12 }, (_, i) => <span key={i} className="flex-1">{i * 8 + 1}</span>)}
    </div>
    <div className="relative z-[1] h-[calc(100%-28px)] overflow-hidden px-2 py-1">
      {tracks.slice(0, 5).map((track, row) => <button key={track.id} onClick={() => setSelectedTrack(track.id)} className={`relative mb-1 flex h-[18%] w-full items-center overflow-hidden rounded-md border text-left transition ${selectedTrack === track.id ? "border-cyan-300/70 bg-cyan-300/8" : "border-white/8 bg-white/[.025]"}`}>
        <span className="w-20 shrink-0 px-2 text-[10px] font-black uppercase tracking-widest" style={{ color: track.color }}>{track.name}</span>
        <div className="relative h-full flex-1">
          <Waveform color={track.color} row={row} />
          {[18, 43, 66, 86].map((left, i) => <span key={i} className="absolute top-[28%] h-3 rounded-sm" style={{ left: `${left + row * 2}%`, width: i % 2 ? 38 : 22, background: i % 2 ? "#ff34df" : "#f6d63d", boxShadow: `0 0 14px ${i % 2 ? "#ff34df" : "#f6d63d"}` }} />)}
        </div>
      </button>)}
    </div>
    {playing && <div className="absolute right-3 top-9 rounded-full border border-green-300/35 bg-green-300/10 px-2 py-1 text-[10px] font-black uppercase text-green-200">Playing</div>}
  </section>;
}

function Waveform({ color, row }: { color: string; row: number }) {
  return <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 40" aria-hidden="true">
    <polyline points={Array.from({ length: 70 }, (_, i) => `${i * 1.45},${20 + Math.sin(i * (0.7 + row * 0.08)) * (5 + (i % 9)) + Math.cos(i * .31) * 4}`).join(" ")} fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" opacity=".95" />
    <polyline points={Array.from({ length: 70 }, (_, i) => `${i * 1.45},${20 - Math.sin(i * (0.7 + row * 0.08)) * (5 + (i % 9)) - Math.cos(i * .31) * 4}`).join(" ")} fill="none" stroke={color} strokeWidth="1.1" strokeLinecap="round" opacity=".55" />
  </svg>;
}

function Inspector({ selected, updateTrack }: { selected: StudioTrack; updateTrack: (id: string, patch: Partial<StudioTrack>) => void }) {
  return <aside className="min-h-0 overflow-hidden rounded-xl border border-yellow-300/35 bg-[#151414] p-3 shadow-[0_0_20px_rgba(246,214,61,.12)]">
    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-yellow-200/70">Inspector</p>
    <h2 className="mt-1 truncate text-xl font-black uppercase tracking-wider" style={{ color: selected.color }}>{selected.name}</h2>
    <div className="mt-3 rounded-lg border border-white/10 bg-black/40 p-2"><WaveBox color={selected.color} /></div>
    <div className="mt-3 grid grid-cols-3 gap-2">
      {[["Mute", "muted"], ["Solo", "solo"], ["Arm", "armed"]].map(([label, key]) => <button key={key} onClick={() => updateTrack(selected.id, { [key]: !selected[key as keyof StudioTrack] } as Partial<StudioTrack>)} className={`rounded-full border px-2 py-2 text-[10px] font-black uppercase ${selected[key as keyof StudioTrack] ? "border-pink-300 bg-pink-400/18 text-pink-100" : "border-white/10 bg-white/[.04] text-white/55"}`}>{label}</button>)}
    </div>
    <KnobGrid selected={selected} />
  </aside>;
}

function WaveBox({ color }: { color: string }) { return <div className="relative h-20 overflow-hidden rounded bg-black"><Waveform color={color} row={2} /></div>; }

function KnobGrid({ selected }: { selected: StudioTrack }) {
  return <div className="mt-3 grid grid-cols-3 gap-3">
    {["Gain", "Tone", "Comp", "Delay", "Verb", "Drive"].map((label, i) => <div key={label} className="text-center"><div className="mx-auto grid h-11 w-11 place-items-center rounded-full border bg-black shadow-[inset_0_0_12px_rgba(255,255,255,.08)]" style={{ borderColor: selected.color }}><span className="h-1 w-5 rounded-full" style={{ background: selected.color, transform: `rotate(${i * 28 - 35}deg)` }} /></div><p className="mt-1 text-[9px] uppercase text-white/45">{label}</p></div>)}
  </div>;
}

function Mixer({ tracks, selectedTrack, setSelectedTrack, updateTrack }: { tracks: StudioTrack[]; selectedTrack: string; setSelectedTrack: (id: string) => void; updateTrack: (id: string, patch: Partial<StudioTrack>) => void }) {
  return <section className="min-h-0 overflow-hidden rounded-xl border border-white/10 bg-[#0b1115] p-2">
    <div className="grid h-full min-h-0 grid-cols-4 gap-2 lg:grid-cols-8">
      {tracks.slice(0, 8).map((track) => <div key={track.id} onClick={() => setSelectedTrack(track.id)} className={`flex min-h-0 flex-col rounded-lg border p-2 ${selectedTrack === track.id ? "bg-white/[.07]" : "bg-black/45"}`} style={{ borderColor: selectedTrack === track.id ? track.color : "rgba(255,255,255,.12)", boxShadow: selectedTrack === track.id ? `0 0 20px ${track.color}35` : undefined }}>
        <div className="truncate text-[10px] font-black uppercase tracking-widest" style={{ color: track.color }}>{track.name}</div>
        <div className="mt-1 h-10 rounded bg-black/70"><Waveform color={track.color} row={1} /></div>
        <div className="mt-2 grid grid-cols-3 gap-1">
          <button onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { muted: !track.muted }); }} className={`rounded border py-1 text-[9px] font-black ${track.muted ? "border-pink-300 bg-pink-300/20 text-pink-100" : "border-white/10 text-white/45"}`}>M</button>
          <button onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { solo: !track.solo }); }} className={`rounded border py-1 text-[9px] font-black ${track.solo ? "border-yellow-300 bg-yellow-300/20 text-yellow-100" : "border-white/10 text-white/45"}`}>S</button>
          <button onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { armed: !track.armed }); }} className={`rounded border py-1 text-[9px] font-black ${track.armed ? "border-red-300 bg-red-300/20 text-red-100" : "border-white/10 text-white/45"}`}>R</button>
        </div>
        <div className="mt-2 flex min-h-0 flex-1 items-end justify-center gap-2">
          <div className="relative h-full w-3 rounded-full bg-white/10"><div className="absolute bottom-0 w-full rounded-full" style={{ height: `${track.muted ? 4 : track.meter}%`, background: track.color, boxShadow: `0 0 14px ${track.color}` }} /></div>
          <input aria-label={`${track.name} volume`} type="range" min="0" max="100" value={track.volume} onChange={(e) => updateTrack(track.id, { volume: Number(e.target.value) })} className="h-full w-6 accent-cyan-300 [writing-mode:vertical-rl]" />
        </div>
        <div className="mt-2 flex items-center justify-between gap-1"><span className="text-[9px] text-white/35">PAN</span><input aria-label={`${track.name} pan`} type="range" min="-50" max="50" value={track.pan} onChange={(e) => updateTrack(track.id, { pan: Number(e.target.value) })} className="w-full accent-pink-400" /></div>
      </div>)}
    </div>
  </section>;
}

function FxRack({ selected }: { selected: StudioTrack }) {
  return <aside className="min-h-0 overflow-hidden rounded-xl border border-white/10 bg-black/55 p-2">
    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-pink-200/70">Rack</p>
    {["Preamp", "Compressor", "EQ", "Echo", "Reverb", "Limiter"].map((fx, i) => <div key={fx} className="mt-2 rounded-lg border border-white/10 bg-white/[.035] p-2"><div className="flex items-center justify-between"><span className="text-[10px] font-black uppercase tracking-widest text-white/55">{fx}</span><span className="h-2 w-2 rounded-full" style={{ background: selected.color, boxShadow: `0 0 10px ${selected.color}` }} /></div><div className="mt-2 flex gap-2">{[0,1,2].map((n) => <div key={n} className="grid h-8 w-8 place-items-center rounded-full border" style={{ borderColor: i === n ? selected.color : "rgba(255,255,255,.12)" }}><span className="h-0.5 w-4" style={{ background: selected.color, transform: `rotate(${i * 22 + n * 31}deg)` }} /></div>)}</div></div>)}
  </aside>;
}

function BottomComposer({ activePad, firePad, addTrack }: { activePad: string | null; firePad: (kind: DrumKind, label: string) => void; addTrack: (kind?: TrackKind) => void }) {
  return <section className="grid min-h-0 grid-cols-[210px_1fr] gap-2 overflow-hidden rounded-xl border border-white/10 bg-[#090e12] p-2">
    <div className="grid grid-cols-4 gap-2"><button onClick={() => addTrack("melody")} className="col-span-4 rounded-md border border-green-300/35 bg-green-300/10 py-1 text-[10px] font-black uppercase tracking-widest text-green-100">+ Add melody track</button>{PADS.map((pad) => <button key={pad.label} onClick={() => firePad(pad.kind, pad.label)} className={`rounded-md border text-[10px] font-black ${activePad === pad.label ? "scale-95" : ""}`} style={{ background: pad.color, borderColor: pad.color, color: "#061014", boxShadow: activePad === pad.label ? `0 0 22px ${pad.color}` : undefined }}>{pad.label}</button>)}</div>
    <div className="relative overflow-hidden rounded-md border border-white/10 bg-black/45"><div className="absolute inset-0 [background-image:linear-gradient(rgba(66,255,86,.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:36px_18px]" />{[22, 38, 57, 73, 88].map((left, i) => <span key={i} className="absolute h-3 rounded-sm bg-green-400 shadow-[0_0_16px_#42ff56]" style={{ left: `${left}%`, top: `${22 + (i % 3) * 22}%`, width: `${10 + i * 4}%` }} />)}</div>
  </section>;
}

function BeatPanel({ activePad, firePad, addTrack }: { activePad: string | null; firePad: (kind: DrumKind, label: string) => void; addTrack: (kind?: TrackKind) => void }) { return <div className="min-h-0 overflow-hidden rounded-xl border border-white/10 bg-black/45 p-3"><BottomComposer activePad={activePad} firePad={firePad} addTrack={addTrack} /></div>; }
function EditPanel({ tracks }: { tracks: StudioTrack[] }) { return <div className="min-h-0 overflow-hidden rounded-xl border border-white/10 bg-black/45 p-3"><Timeline tracks={tracks} selectedTrack={tracks[0]?.id ?? ""} setSelectedTrack={() => {}} playing={false} bar={44} /></div>; }
function UtilityPanel({ mode }: { mode: Mode }) { return <div className="grid min-h-0 place-items-center rounded-xl border border-white/10 bg-black/45 p-6 text-center"><div><p className="text-[10px] font-black uppercase tracking-[.24em] text-cyan-200/70">{mode}</p><h2 className="mt-2 text-3xl font-black uppercase">Coming into the console</h2><p className="mt-2 max-w-md text-sm text-white/50">This view now belongs inside the electric workstation, not a separate ugly module page.</p></div></div>; }
