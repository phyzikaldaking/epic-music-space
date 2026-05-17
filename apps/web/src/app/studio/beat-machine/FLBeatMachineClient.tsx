"use client";

import { useMemo, useState } from "react";

const STEPS = Array.from({ length: 16 }, (_, index) => index);
const PATTERNS = ["A", "B", "C", "D"] as const;
const TEMPLATES = [
  { id: "trap", label: "Trap", bpm: 140, swing: 12 },
  { id: "drill", label: "Drill", bpm: 142, swing: 8 },
  { id: "rnb", label: "R&B", bpm: 84, swing: 22 },
  { id: "boombap", label: "Boom Bap", bpm: 92, swing: 28 },
] as const;

type PatternKey = (typeof PATTERNS)[number];
type Channel = {
  id: string;
  name: string;
  type: string;
  color: string;
  muted: boolean;
  solo: boolean;
  level: number;
  pan: number;
  glide: boolean[];
  patterns: Record<PatternKey, boolean[]>;
};

function makePattern(active: number[]) {
  return STEPS.map((step) => active.includes(step + 1));
}

const STARTER_CHANNELS: Channel[] = [
  { id: "kick", name: "Kick", type: "DRM", color: "#17fff4", muted: false, solo: false, level: 88, pan: 0, glide: STEPS.map(() => false), patterns: { A: makePattern([1, 5, 9, 13]), B: makePattern([1, 4, 9, 12, 15]), C: makePattern([1, 7, 11, 15]), D: makePattern([1, 9]) } },
  { id: "snare", name: "Snare", type: "DRM", color: "#ff34df", muted: false, solo: false, level: 76, pan: 0, glide: STEPS.map(() => false), patterns: { A: makePattern([5, 13]), B: makePattern([5, 12, 13]), C: makePattern([4, 11]), D: makePattern([5, 13, 16]) } },
  { id: "clap", name: "Clap", type: "DRM", color: "#f6d63d", muted: false, solo: false, level: 68, pan: 3, glide: STEPS.map(() => false), patterns: { A: makePattern([5, 13]), B: makePattern([5, 13]), C: makePattern([4, 12]), D: makePattern([13]) } },
  { id: "hat", name: "Hi Hat", type: "HAT", color: "#42ff56", muted: false, solo: false, level: 64, pan: 8, glide: STEPS.map(() => false), patterns: { A: makePattern([1, 3, 5, 7, 9, 11, 13, 15]), B: makePattern([1, 2, 5, 7, 9, 10, 13, 15, 16]), C: makePattern([1, 5, 7, 9, 13, 15]), D: makePattern([1, 3, 4, 7, 9, 11, 12, 15]) } },
  { id: "open", name: "Open Hat", type: "HAT", color: "#a855ff", muted: false, solo: false, level: 52, pan: -12, glide: STEPS.map(() => false), patterns: { A: makePattern([8, 16]), B: makePattern([4, 12]), C: makePattern([7, 15]), D: makePattern([16]) } },
  { id: "perc", name: "Perc", type: "PRC", color: "#ff7a2f", muted: false, solo: false, level: 58, pan: 14, glide: STEPS.map(() => false), patterns: { A: makePattern([3, 10, 15]), B: makePattern([2, 6, 11, 14]), C: makePattern([6, 12]), D: makePattern([3, 8, 14]) } },
  { id: "bass", name: "808", type: "BAS", color: "#23d4ff", muted: false, solo: false, level: 82, pan: 0, glide: makePattern([4, 12, 15]), patterns: { A: makePattern([1, 4, 9, 12, 15]), B: makePattern([1, 3, 8, 11, 14]), C: makePattern([1, 6, 9, 16]), D: makePattern([1, 9, 12]) } },
  { id: "fx", name: "FX", type: "FX", color: "#ff4f8b", muted: false, solo: false, level: 48, pan: -18, glide: STEPS.map(() => false), patterns: { A: makePattern([16]), B: makePattern([8, 16]), C: makePattern([1, 16]), D: makePattern([12]) } },
];

export default function FLBeatMachineClient() {
  const [playing, setPlaying] = useState(false);
  const [bpm, setBpm] = useState(140);
  const [swing, setSwing] = useState(12);
  const [activePattern, setActivePattern] = useState<PatternKey>("A");
  const [playhead, setPlayhead] = useState(0);
  const [channels, setChannels] = useState<Channel[]>(STARTER_CHANNELS);
  const [selectedTemplate, setSelectedTemplate] = useState("trap");
  const activeSteps = useMemo(() => channels.reduce((sum, channel) => sum + channel.patterns[activePattern].filter(Boolean).length, 0), [channels, activePattern]);

  function updateChannel(id: string, patch: Partial<Channel>) {
    setChannels((current) => current.map((channel) => channel.id === id ? { ...channel, ...patch } : channel));
  }

  function toggleStep(channelId: string, step: number) {
    setChannels((current) => current.map((channel) => {
      if (channel.id !== channelId) return channel;
      const next = [...channel.patterns[activePattern]];
      next[step] = !next[step];
      return { ...channel, patterns: { ...channel.patterns, [activePattern]: next } };
    }));
  }

  function clonePattern() {
    const from = activePattern;
    const to = PATTERNS[(PATTERNS.indexOf(activePattern) + 1) % PATTERNS.length];
    setChannels((current) => current.map((channel) => ({ ...channel, patterns: { ...channel.patterns, [to]: [...channel.patterns[from]] } })));
    setActivePattern(to);
  }

  function randomFill() {
    setChannels((current) => current.map((channel) => {
      if (!["hat", "perc", "fx"].includes(channel.id)) return channel;
      const next = channel.patterns[activePattern].map((value, index) => value || index % 4 === 3 || Math.random() > 0.78);
      return { ...channel, patterns: { ...channel.patterns, [activePattern]: next } };
    }));
  }

  function hatRoll() {
    setChannels((current) => current.map((channel) => channel.id === "hat" ? { ...channel, patterns: { ...channel.patterns, [activePattern]: STEPS.map((step) => step % 2 === 0 || step > 11) } } : channel));
  }

  function applyTemplate(templateId: string) {
    const template = TEMPLATES.find((item) => item.id === templateId) ?? TEMPLATES[0];
    setSelectedTemplate(template.id);
    setBpm(template.bpm);
    setSwing(template.swing);
  }

  function exportLoop() {
    const payload = { bpm, swing, activePattern, channels: channels.map((channel) => ({ id: channel.id, name: channel.name, pattern: channel.patterns[activePattern] })) };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ems-beat-pattern-${activePattern}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportMidi() {
    const text = `EMS MIDI placeholder\nBPM: ${bpm}\nPattern: ${activePattern}\nSteps: ${activeSteps}`;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ems-pattern-${activePattern}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-6">
      <div className="rounded-[28px] border border-[#2b3438] bg-[#090c0e] shadow-[0_28px_80px_rgba(0,0,0,.72),inset_0_1px_0_rgba(255,255,255,.08)]">
        <header className="flex flex-col gap-4 border-b border-black/80 bg-[#171d20] p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-mono text-[10px] font-black uppercase tracking-[0.28em] text-[#92a2a7]">EMS Channel Rack</p>
            <h1 className="mt-1 text-2xl font-black uppercase tracking-wide text-white">FL-Style Beat Machine</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setPlaying((value) => !value)} className={`rounded-xl px-5 py-3 text-sm font-black uppercase tracking-widest ${playing ? "bg-red-400 text-black" : "bg-[#42ff56] text-black"}`}>{playing ? "Stop" : "Play"}</button>
            <button onClick={() => setPlayhead((value) => (value + 1) % 16)} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-black uppercase text-white/70">Step</button>
            <label className="rounded-xl border border-white/10 bg-black/35 px-3 py-2 font-mono text-xs text-white/60">BPM <input type="number" value={bpm} min={60} max={220} onChange={(event) => setBpm(Number(event.target.value))} className="ml-2 w-16 bg-transparent font-black text-white outline-none" /></label>
            <label className="rounded-xl border border-white/10 bg-black/35 px-3 py-2 font-mono text-xs text-white/60">Swing {swing}% <input type="range" value={swing} min={0} max={60} onChange={(event) => setSwing(Number(event.target.value))} className="ml-2 align-middle accent-[#42ff56]" /></label>
          </div>
        </header>

        <div className="grid gap-0 lg:grid-cols-[220px_1fr]">
          <aside className="border-b border-black/80 bg-[#111619] p-4 lg:border-b-0 lg:border-r">
            <p className="font-mono text-[10px] font-black uppercase tracking-[0.24em] text-white/40">Templates</p>
            <div className="mt-3 grid gap-2">
              {TEMPLATES.map((template) => <button key={template.id} onClick={() => applyTemplate(template.id)} className={`rounded-xl border px-3 py-3 text-left text-xs font-black uppercase tracking-widest ${selectedTemplate === template.id ? "border-[#42ff56]/60 bg-[#42ff56]/12 text-[#caffca]" : "border-white/10 bg-white/[0.03] text-white/60"}`}>{template.label}<span className="ml-2 text-white/30">{template.bpm}</span></button>)}
            </div>
            <div className="mt-6 grid gap-2">
              <button onClick={randomFill} className="rounded-xl border border-pink-300/35 bg-pink-300/10 px-3 py-3 text-xs font-black uppercase tracking-widest text-pink-100">Random Fill</button>
              <button onClick={hatRoll} className="rounded-xl border border-yellow-300/35 bg-yellow-300/10 px-3 py-3 text-xs font-black uppercase tracking-widest text-yellow-100">Hat Roll</button>
              <button onClick={clonePattern} className="rounded-xl border border-cyan-300/35 bg-cyan-300/10 px-3 py-3 text-xs font-black uppercase tracking-widest text-cyan-100">Clone Pattern</button>
              <button onClick={exportLoop} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-xs font-black uppercase tracking-widest text-white/70">Export Loop</button>
              <button onClick={exportMidi} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-xs font-black uppercase tracking-widest text-white/70">MIDI Export</button>
            </div>
          </aside>

          <main className="overflow-auto bg-[radial-gradient(circle_at_top,#172327,#050708_55%,#000)] p-4">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {PATTERNS.map((pattern) => <button key={pattern} onClick={() => setActivePattern(pattern)} className={`h-10 w-14 rounded-lg border font-mono text-sm font-black ${activePattern === pattern ? "border-[#42ff56] bg-[#42ff56] text-black" : "border-white/10 bg-black/35 text-white/60"}`}>{pattern}</button>)}
              <div className="ml-auto rounded-xl border border-white/10 bg-black/35 px-3 py-2 font-mono text-xs uppercase text-white/45">{activeSteps} active steps</div>
            </div>

            <div className="min-w-[980px] overflow-hidden rounded-2xl border border-black/80 bg-[#111619] shadow-[inset_0_0_30px_rgba(0,0,0,.75)]">
              <div className="grid grid-cols-[210px_80px_80px_1fr] border-b border-black/80 bg-[#20282b] px-3 py-2 font-mono text-[9px] font-black uppercase tracking-widest text-white/35">
                <span>Channel</span><span>Level</span><span>Pan</span><span>Steps</span>
              </div>
              {channels.map((channel) => (
                <div key={channel.id} className="grid grid-cols-[210px_80px_80px_1fr] items-center border-b border-black/60 px-3 py-2 last:border-b-0 hover:bg-white/[0.025]">
                  <div className="flex items-center gap-2">
                    <button onClick={() => updateChannel(channel.id, { muted: !channel.muted })} className={`h-7 w-7 rounded border border-black/80 text-[10px] font-black ${channel.muted ? "bg-red-400 text-black" : "bg-[#252d30] text-white/45"}`}>M</button>
                    <button onClick={() => updateChannel(channel.id, { solo: !channel.solo })} className={`h-7 w-7 rounded border border-black/80 text-[10px] font-black ${channel.solo ? "bg-yellow-300 text-black" : "bg-[#252d30] text-white/45"}`}>S</button>
                    <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: channel.color }} />
                    <div>
                      <p className="font-mono text-xs font-black uppercase text-white">{channel.name}</p>
                      <p className="font-mono text-[9px] uppercase text-white/32">{channel.type}</p>
                    </div>
                  </div>
                  <input type="range" min={0} max={100} value={channel.level} onChange={(event) => updateChannel(channel.id, { level: Number(event.target.value) })} className="w-16 accent-[#42ff56]" />
                  <input type="range" min={-50} max={50} value={channel.pan} onChange={(event) => updateChannel(channel.id, { pan: Number(event.target.value) })} className="w-16 accent-[#23d4ff]" />
                  <div className="grid grid-cols-16 gap-1">
                    {STEPS.map((step) => {
                      const active = channel.patterns[activePattern][step];
                      const current = step === playhead;
                      const glide = channel.id === "bass" && channel.glide[step];
                      return <button key={step} onClick={() => toggleStep(channel.id, step)} className={`relative h-9 rounded border text-[9px] font-black ${active ? "border-black bg-[#f0b84a] text-black shadow-[0_0_12px_rgba(240,184,74,.4)]" : "border-black/70 bg-[#252d30] text-white/20"} ${current ? "ring-2 ring-[#42ff56]" : ""}`}>{step + 1}{glide && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#23d4ff]" />}</button>;
                    })}
                  </div>
                </div>
              ))}
            </div>

            <section className="mt-4 grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/35 p-4"><p className="font-mono text-[10px] font-black uppercase tracking-widest text-cyan-200/70">808 Glide</p><p className="mt-2 text-sm text-white/55">Blue dots mark slide steps. Full pitch glide automation comes next.</p></div>
              <div className="rounded-2xl border border-white/10 bg-black/35 p-4"><p className="font-mono text-[10px] font-black uppercase tracking-widest text-pink-200/70">Piano Roll Dock</p><p className="mt-2 text-sm text-white/55">Reserved lower dock for melodic notes, 808 pitch, and chop editing.</p></div>
              <div className="rounded-2xl border border-white/10 bg-black/35 p-4"><p className="font-mono text-[10px] font-black uppercase tracking-widest text-yellow-200/70">Pattern Arranger</p><p className="mt-2 text-sm text-white/55">Arrange intro, verse, hook, bridge, and outro from pattern blocks.</p></div>
            </section>
          </main>
        </div>
      </div>
    </section>
  );
}
