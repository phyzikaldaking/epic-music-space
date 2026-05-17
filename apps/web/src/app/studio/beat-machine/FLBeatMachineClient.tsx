"use client";

import { useEffect, useMemo, useState } from "react";

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

  useEffect(() => {
    if (!playing) return;
    const stepMs = (60_000 / Math.max(40, bpm)) / 4;
    const id = window.setInterval(() => setPlayhead((value) => (value + 1) % STEPS.length), stepMs);
    return () => window.clearInterval(id);
  }, [playing, bpm]);

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
    <section className="w-full px-2 py-2 sm:px-3">
      <div className="mx-auto max-w-[1500px] overflow-hidden rounded-xl border border-[#2b3438] bg-[#090c0e] shadow-[0_18px_48px_rgba(0,0,0,.62),inset_0_1px_0_rgba(255,255,255,.08)]">
        <header className="sticky top-0 z-20 flex min-h-12 flex-wrap items-center gap-2 border-b border-black/80 bg-[#171d20] px-3 py-2">
          <button onClick={() => setPlaying((value) => !value)} className={`h-9 rounded-lg px-4 text-xs font-black uppercase tracking-widest ${playing ? "bg-red-400 text-black" : "bg-[#42ff56] text-black"}`}>{playing ? "Stop" : "Play"}</button>
          <button onClick={() => setPlayhead((value) => (value + 1) % 16)} className="h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-[10px] font-black uppercase text-white/70">Step</button>
          <label className="h-9 rounded-lg border border-white/10 bg-black/35 px-3 py-2 font-mono text-[10px] text-white/60">BPM <input type="number" value={bpm} min={60} max={220} onChange={(event) => setBpm(Number(event.target.value))} className="ml-2 w-14 bg-transparent font-black text-white outline-none" /></label>
          <label className="hidden h-9 items-center rounded-lg border border-white/10 bg-black/35 px-3 font-mono text-[10px] text-white/60 sm:flex">Swing {swing}% <input type="range" value={swing} min={0} max={60} onChange={(event) => setSwing(Number(event.target.value))} className="ml-2 w-20 accent-[#42ff56]" /></label>
          <div className="ml-auto flex items-center gap-1">
            {PATTERNS.map((pattern) => <button key={pattern} onClick={() => setActivePattern(pattern)} className={`h-9 w-10 rounded-md border font-mono text-xs font-black ${activePattern === pattern ? "border-[#42ff56] bg-[#42ff56] text-black" : "border-white/10 bg-black/35 text-white/60"}`}>{pattern}</button>)}
          </div>
        </header>

        <div className="flex min-h-[calc(100dvh-104px)] flex-col lg:flex-row">
          <aside className="order-2 grid gap-2 border-t border-black/80 bg-[#111619] p-2 lg:order-1 lg:w-44 lg:border-r lg:border-t-0">
            <div className="grid grid-cols-4 gap-1 lg:grid-cols-1">
              {TEMPLATES.map((template) => <button key={template.id} onClick={() => applyTemplate(template.id)} className={`rounded-md border px-2 py-2 text-left text-[10px] font-black uppercase tracking-widest ${selectedTemplate === template.id ? "border-[#42ff56]/60 bg-[#42ff56]/12 text-[#caffca]" : "border-white/10 bg-white/[0.03] text-white/60"}`}>{template.label}<span className="ml-1 text-white/30">{template.bpm}</span></button>)}
            </div>
            <div className="grid grid-cols-5 gap-1 lg:grid-cols-1">
              <button onClick={randomFill} className="rounded-md border border-pink-300/30 bg-pink-300/10 px-2 py-2 text-[9px] font-black uppercase tracking-widest text-pink-100">Fill</button>
              <button onClick={hatRoll} className="rounded-md border border-yellow-300/30 bg-yellow-300/10 px-2 py-2 text-[9px] font-black uppercase tracking-widest text-yellow-100">Hat Roll</button>
              <button onClick={clonePattern} className="rounded-md border border-cyan-300/30 bg-cyan-300/10 px-2 py-2 text-[9px] font-black uppercase tracking-widest text-cyan-100">Clone</button>
              <button onClick={exportLoop} className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-2 text-[9px] font-black uppercase tracking-widest text-white/70">Loop</button>
              <button onClick={exportMidi} className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-2 text-[9px] font-black uppercase tracking-widest text-white/70">MIDI</button>
            </div>
          </aside>

          <main className="order-1 min-w-0 flex-1 overflow-auto bg-[radial-gradient(circle_at_top,#172327,#050708_55%,#000)] p-2 lg:order-2">
            <div className="min-w-[900px] overflow-hidden rounded-lg border border-black/80 bg-[#111619] shadow-[inset_0_0_30px_rgba(0,0,0,.75)]">
              <div className="grid grid-cols-[190px_68px_68px_1fr] border-b border-black/80 bg-[#20282b] px-2 py-1.5 font-mono text-[8px] font-black uppercase tracking-widest text-white/35">
                <span>Channel</span><span>Level</span><span>Pan</span>
                <div className="grid grid-cols-16 gap-1">
                  {STEPS.map((step) => <div key={step} className={`text-center ${step === playhead ? "text-[#42ff56]" : "text-white/35"}`}>{step + 1}</div>)}
                </div>
              </div>
              {channels.map((channel) => (
                <div key={channel.id} className="grid grid-cols-[190px_68px_68px_1fr] items-center border-b border-black/60 px-2 py-1.5 last:border-b-0 hover:bg-white/[0.025]">
                  <div className="flex items-center gap-2">
                    <button onClick={() => updateChannel(channel.id, { muted: !channel.muted })} className={`h-7 w-7 rounded border border-black/80 text-[10px] font-black ${channel.muted ? "bg-red-400 text-black" : "bg-[#252d30] text-white/45"}`}>M</button>
                    <button onClick={() => updateChannel(channel.id, { solo: !channel.solo })} className={`h-7 w-7 rounded border border-black/80 text-[10px] font-black ${channel.solo ? "bg-yellow-300 text-black" : "bg-[#252d30] text-white/45"}`}>S</button>
                    <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: channel.color }} />
                    <div>
                      <p className="font-mono text-xs font-black uppercase text-white">{channel.name}</p>
                      <p className="font-mono text-[8px] uppercase text-white/32">{channel.type}</p>
                    </div>
                  </div>
                  <input type="range" min={0} max={100} value={channel.level} onChange={(event) => updateChannel(channel.id, { level: Number(event.target.value) })} className="w-14 accent-[#42ff56]" />
                  <input type="range" min={-50} max={50} value={channel.pan} onChange={(event) => updateChannel(channel.id, { pan: Number(event.target.value) })} className="w-14 accent-[#23d4ff]" />
                  <div className="relative grid grid-cols-16 gap-1">
                    {STEPS.map((step) => {
                      const active = channel.patterns[activePattern][step];
                      const current = step === playhead;
                      const glide = channel.id === "bass" && channel.glide[step];
                      return <button key={step} onClick={() => toggleStep(channel.id, step)} className={`relative h-8 rounded-sm border text-[8px] font-black ${active ? "border-black bg-[#f0b84a] text-black shadow-[0_0_10px_rgba(240,184,74,.36)]" : "border-black/70 bg-[#252d30] text-white/20"} ${current ? "outline outline-2 outline-[#42ff56]" : ""}`}>{glide && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#23d4ff]" />}</button>;
                    })}
                  </div>
                </div>
              ))}
            </div>

            <section className="mt-2 grid gap-2 text-xs text-white/50 lg:grid-cols-3">
              <div className="rounded-lg border border-white/10 bg-black/35 p-2"><b className="text-cyan-200/80">808 Glide</b> Blue dots mark slide steps.</div>
              <div className="rounded-lg border border-white/10 bg-black/35 p-2"><b className="text-pink-200/80">Piano Roll</b> Dock reserved below rack.</div>
              <div className="rounded-lg border border-white/10 bg-black/35 p-2"><b className="text-yellow-200/80">Arranger</b> Pattern blocks come next.</div>
            </section>
          </main>
        </div>
      </div>
    </section>
  );
}
