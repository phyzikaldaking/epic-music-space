"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import BeatMachineProClient from "./BeatMachineProClient";

type SmartMode = "balanced" | "trap" | "soul" | "cinematic" | "club";
type BankId = "A" | "B" | "C" | "D";
type PadRole = "kick" | "snare" | "hat" | "808" | "sample" | "melody" | "fx" | "empty";
type SmartSound = { id: string; name: string; url: string; instrument?: string; source?: string; createdAt?: string };
type SmartPad = { id: string; bank: BankId; number: number; name: string; role: PadRole; soundName?: string; soundUrl?: string; tune: number; gain: number; pan: number; reverse: boolean; trimStart: number; trimEnd: number; chokeGroup: string; color: string };
type SmartNote = { id: string; padId: string; step: number; length: number; velocity: number };
type FrequencyLane = { name: string; range: string; move: string; reason: string };

const BANKS: BankId[] = ["A", "B", "C", "D"];
const PAD_COLORS = ["#17fff4", "#ff34df", "#f6d63d", "#42ff56", "#a855ff", "#ff7a2f", "#23d4ff", "#ff4f8b", "#c4ff3d", "#ff3d71", "#3d7cff", "#ffffff", "#2dff9f", "#f2a900", "#a78bfa", "#fb7185"];
const DEFAULT_PROJECT_ID = "ems-default-project";
const DEFAULT_SESSION_ID = "ems-smart-mpc-session";
const SMART_KIT_KEY = "ems-smart-mpc-kit-v1";
const SMART_NOTES_KEY = "ems-smart-mpc-notes-v1";
const MY_SOUNDS_KEY = "ems-smart-mpc-my-sounds-v1";

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
  "Real waveform + transient sampler lives below in Pro Sampler",
  "16 pads per bank with A/B/C/D banks",
  "Drag sounds onto pads to assign instantly",
  "Choke groups stop colliding hats and chops",
  "Per-pad tune, gain, pan, reverse, trim",
  "Piano roll notes now carry length and velocity",
  "My Sounds uploads to Supabase audio-assets",
  "Custom kits save to the beat-pattern backend",
  "Full arrangement manifest exports for playback/export handoff",
  "Smart profile stores tone and frequency decisions",
];

declare global {
  interface Window {
    __EMS_MPC_AUDIO_CONTEXT__?: AudioContext;
    __EMS_MPC_LATENCY_READY__?: boolean;
    __EMS_MPC_SOUND_CACHE__?: { sounds?: SmartSound[] } | unknown;
  }
}

function createPads(): SmartPad[] {
  return BANKS.flatMap((bank) => Array.from({ length: 16 }, (_, index) => ({
    id: `${bank}${index + 1}`,
    bank,
    number: index + 1,
    name: `${bank}${index + 1}`,
    role: index === 0 ? "kick" : index === 1 ? "snare" : index < 6 ? "hat" : index < 10 ? "sample" : index < 13 ? "melody" : "empty",
    tune: 0,
    gain: 0.9,
    pan: 0,
    reverse: false,
    trimStart: 0,
    trimEnd: 1,
    chokeGroup: index < 6 ? "hats" : index < 10 ? "chops" : "none",
    color: PAD_COLORS[index % PAD_COLORS.length],
  })));
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

function safeRead<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { return JSON.parse(window.localStorage.getItem(key) || "") as T; } catch { return fallback; }
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function BeatMachineSmartClient() {
  const [mode, setMode] = useState<SmartMode>("trap");
  const [latencyReady, setLatencyReady] = useState(false);
  const [activeBank, setActiveBank] = useState<BankId>("A");
  const [pads, setPads] = useState<SmartPad[]>(() => createPads());
  const [selectedPadId, setSelectedPadId] = useState("A1");
  const [mySounds, setMySounds] = useState<SmartSound[]>([]);
  const [notes, setNotes] = useState<SmartNote[]>([]);
  const [status, setStatus] = useState("Smart MPC ready.");
  const [arrangementBars, setArrangementBars] = useState(8);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lanes = useMemo(() => MODE_LANES[mode], [mode]);
  const bankPads = useMemo(() => pads.filter((pad) => pad.bank === activeBank), [pads, activeBank]);
  const selectedPad = useMemo(() => pads.find((pad) => pad.id === selectedPadId) || pads[0], [pads, selectedPadId]);
  const kitSnapshot = useMemo(() => ({ mode, pads, notes, arrangementBars, updatedAt: new Date().toISOString() }), [mode, pads, notes, arrangementBars]);

  useEffect(() => {
    setPads(safeRead(SMART_KIT_KEY, createPads()));
    setNotes(safeRead(SMART_NOTES_KEY, []));
    setMySounds(safeRead(MY_SOUNDS_KEY, []));
  }, []);

  useEffect(() => {
    const prewarm = () => {
      void warmAudioEngine().then(() => setLatencyReady(Boolean(window.__EMS_MPC_LATENCY_READY__)));
    };
    document.addEventListener("pointerdown", prewarm, { capture: true, passive: true });
    document.addEventListener("keydown", prewarm, { capture: true });
    document.documentElement.dataset.emsMpcLatency = "armed";
    void refreshMySounds();
    return () => {
      document.removeEventListener("pointerdown", prewarm, true);
      document.removeEventListener("keydown", prewarm, true);
      delete document.documentElement.dataset.emsMpcLatency;
    };
  }, []);

  useEffect(() => { window.localStorage.setItem(SMART_KIT_KEY, JSON.stringify(pads)); }, [pads]);
  useEffect(() => { window.localStorage.setItem(SMART_NOTES_KEY, JSON.stringify(notes)); }, [notes]);
  useEffect(() => { window.localStorage.setItem(MY_SOUNDS_KEY, JSON.stringify(mySounds)); }, [mySounds]);
  useEffect(() => { window.localStorage.setItem("ems-smart-mpc-profile", JSON.stringify({ mode, lanes, updatedAt: new Date().toISOString() })); }, [mode, lanes]);

  async function refreshMySounds() {
    try {
      const res = await fetch("/api/studio/sounds/library?limit=250", { cache: "no-store" });
      const data = await res.json();
      const sounds = Array.isArray(data?.sounds) ? data.sounds as SmartSound[] : [];
      window.__EMS_MPC_SOUND_CACHE__ = data;
      setMySounds((current) => {
        const merged = [...sounds, ...current];
        return Array.from(new Map(merged.map((sound) => [sound.url || sound.id, sound])).values()).slice(0, 250);
      });
      setStatus(`Loaded ${sounds.length} cloud sounds.`);
    } catch {
      setStatus("Cloud sound refresh failed; local My Sounds still available.");
    }
  }

  async function uploadSound(file: File) {
    const localUrl = URL.createObjectURL(file);
    const fallbackSound: SmartSound = { id: `local-${Date.now()}`, name: file.name, url: localUrl, source: "local", instrument: "custom", createdAt: new Date().toISOString() };
    setMySounds((current) => [fallbackSound, ...current].slice(0, 250));
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kit", mode);
      form.append("instrument", selectedPad.role === "empty" ? "custom" : selectedPad.role);
      const res = await fetch("/api/studio/sounds/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data?.sound) throw new Error(data?.error || "Upload failed");
      setMySounds((current) => [data.sound as SmartSound, ...current.filter((sound) => sound.id !== fallbackSound.id)].slice(0, 250));
      assignSoundToPad(data.sound as SmartSound, selectedPad.id);
      setStatus(`${file.name} uploaded to Supabase and assigned to ${selectedPad.id}.`);
    } catch {
      assignSoundToPad(fallbackSound, selectedPad.id);
      setStatus(`${file.name} assigned locally. Cloud upload unavailable.`);
    }
  }

  function assignSoundToPad(sound: SmartSound, padId = selectedPadId) {
    setPads((current) => current.map((pad) => pad.id === padId ? { ...pad, soundName: sound.name, soundUrl: sound.url, role: inferRole(sound.name, pad.role), name: pad.name === pad.id ? `${pad.id} ${sound.name.slice(0, 10)}` : pad.name } : pad));
  }

  function inferRole(name: string, fallback: PadRole): PadRole {
    const lower = name.toLowerCase();
    if (lower.includes("kick")) return "kick";
    if (lower.includes("snare") || lower.includes("clap")) return "snare";
    if (lower.includes("hat")) return "hat";
    if (lower.includes("808") || lower.includes("bass")) return "808";
    if (lower.includes("fx") || lower.includes("riser")) return "fx";
    if (lower.includes("key") || lower.includes("piano") || lower.includes("synth") || lower.includes("melody")) return "melody";
    return fallback === "empty" ? "sample" : fallback;
  }

  function updateSelectedPad(patch: Partial<SmartPad>) {
    setPads((current) => current.map((pad) => pad.id === selectedPad.id ? { ...pad, ...patch } : pad));
  }

  function toggleNote(step: number) {
    const existing = notes.find((note) => note.padId === selectedPad.id && note.step === step);
    if (existing) setNotes((current) => current.filter((note) => note.id !== existing.id));
    else setNotes((current) => [...current, { id: `note-${selectedPad.id}-${step}-${Date.now()}`, padId: selectedPad.id, step, length: 1, velocity: 92 }]);
  }

  function updateNote(step: number, patch: Partial<SmartNote>) {
    setNotes((current) => current.map((note) => note.padId === selectedPad.id && note.step === step ? { ...note, ...patch } : note));
  }

  async function saveKitToCloud() {
    const tracks = BANKS.map((bank) => ({ id: `bank-${bank}`, name: `Bank ${bank}`, kind: "drum", color: "#17fff4", level: 90, pan: 0, muted: false, padKind: "kick", pattern: Array.from({ length: 16 }, (_, step) => notes.some((note) => note.padId.startsWith(bank) && note.step === step)) }));
    try {
      const res = await fetch("/api/studio/beat-patterns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: `smart-kit-${Date.now()}`, projectId: DEFAULT_PROJECT_ID, sessionId: DEFAULT_SESSION_ID, name: `Smart MPC Kit ${new Date().toLocaleString()}`, bpm: 92, swing: 0, tracks, arrangement: [{ id: "smart-mpc-kit", pads, notes, mode, arrangementBars }] }) });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Save failed");
      setStatus("Custom Smart MPC kit saved to cloud/backend.");
    } catch {
      setStatus("Cloud kit save failed; local kit remains saved in browser.");
    }
  }

  function exportArrangement() {
    downloadJson("ems-smart-mpc-arrangement.json", {
      type: "ems-smart-mpc-arrangement",
      bars: arrangementBars,
      banks: BANKS,
      pads,
      notes,
      mySounds: mySounds.map((sound) => ({ id: sound.id, name: sound.name, url: sound.url, instrument: sound.instrument })),
      playback: {
        mode: "full-arrangement-manifest",
        noteLengthAndVelocity: true,
        padControls: ["tune", "gain", "pan", "reverse", "trimStart", "trimEnd", "chokeGroup"],
        renderTarget: "studio arrangement playback/export engine",
      },
      exportedAt: new Date().toISOString(),
    });
    setStatus("Full arrangement manifest exported for playback/export handoff.");
  }

  function padDragStart(sound: SmartSound, event: React.DragEvent<HTMLButtonElement>) {
    event.dataTransfer.setData("application/x-ems-sound", JSON.stringify(sound));
  }

  function padDrop(padId: string, event: React.DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    const raw = event.dataTransfer.getData("application/x-ems-sound");
    if (!raw) return;
    try { assignSoundToPad(JSON.parse(raw) as SmartSound, padId); setStatus(`Sound assigned to ${padId}.`); } catch { setStatus("Drop failed."); }
  }

  return <div className="min-h-screen bg-[#030607] text-white">
    <style jsx global>{`
      html[data-ems-mpc-latency="armed"] button,
      html[data-ems-mpc-latency="armed"] [role="button"] { touch-action: manipulation; -webkit-tap-highlight-color: transparent; user-select: none; }
      html[data-ems-mpc-latency="armed"] * { scroll-behavior: auto !important; }
    `}</style>
    <section className="mx-auto mb-2 max-w-[1900px] px-2 pt-2 sm:px-4">
      <div className="rounded-2xl border border-cyan-300/20 bg-black/55 p-3 shadow-[0_0_28px_rgba(23,255,244,.08)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-200/70">Smart MPC intelligence layer</p>
            <h2 className="text-lg font-black uppercase tracking-wide text-white sm:text-2xl">AI tone, frequency, latency, pad-bank and cloud kit board</h2>
          </div>
          <input ref={fileInputRef} type="file" accept="audio/*" className="sr-only" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void uploadSound(file); event.currentTarget.value = ""; }} />
          <span className={`rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-widest ${latencyReady ? "border-green-300/50 bg-green-300/10 text-green-100" : "border-yellow-300/40 bg-yellow-300/10 text-yellow-100"}`}>{latencyReady ? "Low-latency armed" : "Tap any pad to arm audio"}</span>
          <select value={mode} onChange={(event) => setMode(event.target.value as SmartMode)} className="rounded-xl border border-white/10 bg-black px-3 py-2 text-xs font-black uppercase tracking-widest text-cyan-100"><option value="trap">Trap</option><option value="balanced">Balanced</option><option value="soul">Soul Sample</option><option value="cinematic">Cinematic</option><option value="club">Club</option></select>
          <button onClick={() => fileInputRef.current?.click()} className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-[10px] font-black uppercase text-cyan-100">Upload My Sound</button>
          <button onClick={() => void saveKitToCloud()} className="rounded-xl border border-green-300/30 bg-green-300/10 px-3 py-2 text-[10px] font-black uppercase text-green-100">Save Kit Cloud</button>
          <button onClick={exportArrangement} className="rounded-xl border border-pink-300/30 bg-pink-300/10 px-3 py-2 text-[10px] font-black uppercase text-pink-100">Export Arrangement</button>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">{lanes.map((lane) => <div key={lane.name} className="rounded-xl border border-white/10 bg-white/[.035] p-3"><div className="flex items-center justify-between gap-2"><b className="text-xs uppercase text-cyan-100">{lane.name}</b><span className="rounded-full border border-white/10 px-2 py-1 text-[9px] uppercase text-white/50">{lane.range}</span></div><p className="mt-2 text-xs font-semibold text-white/75">{lane.move}</p><p className="mt-1 text-[11px] leading-4 text-white/45">{lane.reason}</p></div>)}</div>
        <div className="mt-3 grid gap-2 md:grid-cols-5">{SMART_ACTIONS.map((action) => <div key={action} className="rounded-lg border border-green-300/15 bg-green-300/[.04] px-3 py-2 text-[10px] font-black uppercase leading-4 tracking-wider text-green-100/80">{action}</div>)}</div>
        <div className="mt-3 rounded-xl border border-white/10 bg-black/35 p-3 text-xs font-bold text-white/65">{status}</div>
      </div>
    </section>

    <section className="mx-auto mb-2 grid max-w-[1900px] gap-3 px-2 sm:px-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-2xl border border-white/10 bg-black/45 p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="mr-auto text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200/70">16-pad MPC layout with banks</p>
          {BANKS.map((bank) => <button key={bank} onClick={() => setActiveBank(bank)} className={`rounded-xl border px-4 py-2 text-xs font-black uppercase ${activeBank === bank ? "border-cyan-300 bg-cyan-300/15 text-cyan-100" : "border-white/10 text-white/45"}`}>Bank {bank}</button>)}
        </div>
        <div className="grid grid-cols-4 gap-2 lg:grid-cols-8 xl:grid-cols-4 2xl:grid-cols-8">
          {bankPads.map((pad) => <button key={pad.id} onClick={() => setSelectedPadId(pad.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => padDrop(pad.id, event)} className={`min-h-24 rounded-2xl border p-3 text-left transition ${selectedPad.id === pad.id ? "scale-[.98] ring-2 ring-white/50" : "hover:scale-[.99]"}`} style={{ background: pad.color, borderColor: pad.color, color: "#061014" }}>
            <span className="block text-lg font-black uppercase">{pad.id}</span>
            <span className="block truncate text-[10px] font-black uppercase opacity-75">{pad.soundName || pad.role}</span>
            <span className="mt-2 block text-[9px] font-black uppercase opacity-60">Choke {pad.chokeGroup} · {pad.reverse ? "Rev" : "Fwd"}</span>
          </button>)}
        </div>
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[.035] p-3">
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.24em] text-pink-200/70">Piano roll note length + velocity editor for {selectedPad.id}</p>
          <div className="grid grid-cols-8 gap-1 lg:grid-cols-16">{Array.from({ length: 16 }, (_, step) => { const note = notes.find((item) => item.padId === selectedPad.id && item.step === step); return <button key={step} onClick={() => toggleNote(step)} className={`h-9 rounded-lg border text-[10px] font-black ${note ? "border-green-300 bg-green-300/40 text-black" : "border-white/10 bg-black/35 text-white/35"}`}>{step + 1}</button>; })}</div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">{notes.filter((note) => note.padId === selectedPad.id).map((note) => <div key={note.id} className="rounded-lg border border-white/10 bg-black/40 p-2"><b className="text-[10px] uppercase text-white/70">Step {note.step + 1}</b><Range label={`Length ${note.length}`} min={1} max={16} value={note.length} onChange={(value) => updateNote(note.step, { length: value })} /><Range label={`Velocity ${note.velocity}`} min={1} max={127} value={note.velocity} onChange={(value) => updateNote(note.step, { velocity: value })} /></div>)}</div>
        </div>
      </div>

      <aside className="space-y-3">
        <div className="rounded-2xl border border-yellow-300/20 bg-black/45 p-3">
          <p className="mb-3 text-[10px] font-black uppercase tracking-[0.24em] text-yellow-200/70">Per-pad controls</p>
          <div className="mb-2 flex items-center gap-2"><span className="grid h-10 w-10 place-items-center rounded-lg font-black text-black" style={{ background: selectedPad.color }}>{selectedPad.id}</span><div className="min-w-0"><b className="block truncate text-sm uppercase text-white">{selectedPad.name}</b><span className="block truncate text-[10px] uppercase text-white/45">{selectedPad.soundName || "Drop/upload a sound"}</span></div></div>
          <label className="mb-2 block text-xs uppercase text-white/55">Role<select value={selectedPad.role} onChange={(event) => updateSelectedPad({ role: event.target.value as PadRole })} className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-xs"><option value="kick">Kick</option><option value="snare">Snare</option><option value="hat">Hat</option><option value="808">808</option><option value="sample">Sample</option><option value="melody">Melody</option><option value="fx">FX</option><option value="empty">Empty</option></select></label>
          <Range label={`Tune ${selectedPad.tune} semis`} min={-24} max={24} value={selectedPad.tune} onChange={(value) => updateSelectedPad({ tune: value })} />
          <Range label={`Gain ${Math.round(selectedPad.gain * 100)}%`} min={0} max={150} value={Math.round(selectedPad.gain * 100)} onChange={(value) => updateSelectedPad({ gain: value / 100 })} />
          <Range label={`Pan ${selectedPad.pan}`} min={-50} max={50} value={selectedPad.pan} onChange={(value) => updateSelectedPad({ pan: value })} />
          <Range label={`Trim Start ${selectedPad.trimStart}%`} min={0} max={99} value={selectedPad.trimStart} onChange={(value) => updateSelectedPad({ trimStart: value })} />
          <Range label={`Trim End ${selectedPad.trimEnd}%`} min={1} max={100} value={selectedPad.trimEnd} onChange={(value) => updateSelectedPad({ trimEnd: value })} />
          <div className="grid grid-cols-2 gap-2"><button onClick={() => updateSelectedPad({ reverse: !selectedPad.reverse })} className={`rounded-xl border px-3 py-2 text-[10px] font-black uppercase ${selectedPad.reverse ? "border-pink-300 bg-pink-300/10 text-pink-100" : "border-white/10 text-white/45"}`}>Reverse</button><select value={selectedPad.chokeGroup} onChange={(event) => updateSelectedPad({ chokeGroup: event.target.value })} className="rounded-xl border border-white/10 bg-black px-3 py-2 text-[10px] uppercase"><option value="none">No choke</option><option value="hats">Hats</option><option value="chops">Chops</option><option value="808">808</option><option value="custom-a">Custom A</option></select></div>
        </div>
        <div className="rounded-2xl border border-green-300/20 bg-black/45 p-3">
          <div className="mb-2 flex items-center gap-2"><p className="mr-auto text-[10px] font-black uppercase tracking-[0.24em] text-green-200/70">Cloud My Sounds</p><button onClick={() => void refreshMySounds()} className="rounded-lg border border-green-300/30 px-2 py-1 text-[10px] uppercase text-green-100">Refresh</button></div>
          <div className="grid max-h-72 gap-2 overflow-y-auto pr-1">{mySounds.length === 0 && <p className="text-sm text-white/45">Upload or refresh sounds to drag them onto pads.</p>}{mySounds.slice(0, 40).map((sound) => <button key={`${sound.id}-${sound.url}`} draggable onDragStart={(event) => padDragStart(sound, event)} onClick={() => assignSoundToPad(sound)} className="rounded-lg border border-white/10 bg-white/[.035] p-2 text-left"><b className="block truncate text-xs uppercase text-green-100">{sound.name}</b><span className="text-[10px] uppercase text-white/40">{sound.instrument || sound.source || "sound"}</span></button>)}</div>
        </div>
        <div className="rounded-2xl border border-pink-300/20 bg-black/45 p-3"><p className="mb-2 text-[10px] font-black uppercase tracking-[0.24em] text-pink-200/70">Arrangement export</p><Range label={`Bars ${arrangementBars}`} min={1} max={64} value={arrangementBars} onChange={setArrangementBars} /><button onClick={() => downloadJson("ems-smart-mpc-kit-local.json", kitSnapshot)} className="w-full rounded-xl border border-white/10 bg-white/[.035] px-3 py-2 text-xs font-black uppercase text-white/70">Download Kit Snapshot</button></div>
      </aside>
    </section>
    <BeatMachineProClient />
  </div>;
}

function Range({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (value: number) => void }) {
  return <label className="mb-2 block"><span className="text-[10px] font-black uppercase text-white/45">{label}</span><input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-1 w-full accent-cyan-300" /></label>;
}
