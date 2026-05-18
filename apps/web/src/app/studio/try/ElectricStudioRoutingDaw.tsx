"use client";

import { useMemo, useState } from "react";

import ElectricStudioMixerDaw from "./ElectricStudioMixerDaw";

type Bus = "Main" | "Bus 1" | "Bus 2" | "Vocal Aux" | "FX Return";
type InsertSlot = { id: string; name: string; enabled: boolean };
type Channel = {
  id: string;
  name: string;
  color: string;
  soloSafe: boolean;
  route: Bus;
  sendReverb: number;
  sendDelay: number;
  inserts: InsertSlot[];
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  compThreshold: number;
  compRatio: number;
};

const initialChannels: Channel[] = [
  {
    id: "vocal",
    name: "Vocal Bus",
    color: "#65d6ff",
    soloSafe: true,
    route: "Vocal Aux",
    sendReverb: 18,
    sendDelay: 12,
    inserts: [
      { id: "eq", name: "EQ III", enabled: true },
      { id: "comp", name: "Compressor", enabled: true },
      { id: "tune", name: "Pitch Assist", enabled: false },
    ],
    eqLow: -1,
    eqMid: 2,
    eqHigh: 3,
    compThreshold: -18,
    compRatio: 3,
  },
  {
    id: "music",
    name: "Music Bus",
    color: "#f9d66a",
    soloSafe: false,
    route: "Bus 1",
    sendReverb: 8,
    sendDelay: 6,
    inserts: [
      { id: "eq", name: "EQ III", enabled: true },
      { id: "sat", name: "Tape Sat", enabled: false },
      { id: "lim", name: "Limiter", enabled: false },
    ],
    eqLow: 2,
    eqMid: -1,
    eqHigh: 1,
    compThreshold: -12,
    compRatio: 2,
  },
  {
    id: "fx",
    name: "FX Return",
    color: "#ff7adf",
    soloSafe: true,
    route: "Main",
    sendReverb: 0,
    sendDelay: 0,
    inserts: [
      { id: "verb", name: "Plate Reverb", enabled: true },
      { id: "delay", name: "Tempo Delay", enabled: true },
      { id: "widener", name: "Stereo Width", enabled: false },
    ],
    eqLow: 0,
    eqMid: 0,
    eqHigh: 2,
    compThreshold: -24,
    compRatio: 1.5,
  },
];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function updateById<T extends { id: string }>(items: T[], id: string, patch: Partial<T>) {
  return items.map((item) => item.id === id ? { ...item, ...patch } : item);
}

function Knob({ label, value, min, max, onChange, accent }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void; accent: string }) {
  const rotation = -135 + ((value - min) / (max - min)) * 270;
  return (
    <label className="grid place-items-center gap-1 rounded-xl border border-white/10 bg-black/35 p-2 text-center text-[9px] font-black uppercase tracking-widest text-white/45">
      <button
        type="button"
        onClick={() => onChange(value >= max ? min : Math.min(max, value + (max - min) / 8))}
        className="relative h-12 w-12 rounded-full border border-white/15 bg-[radial-gradient(circle_at_35%_30%,#5b626e,#11151b_68%)] shadow-[inset_0_2px_4px_rgba(255,255,255,.16),0_8px_18px_rgba(0,0,0,.35)]"
        aria-label={label}
      >
        <span className="absolute left-1/2 top-1/2 h-5 w-[3px] origin-bottom -translate-x-1/2 -translate-y-full rounded-full" style={{ backgroundColor: accent, transform: `translate(-50%, -100%) rotate(${rotation}deg)` }} />
      </button>
      <span>{label}</span>
      <span className="font-mono text-white/65">{Number(value.toFixed(1))}</span>
    </label>
  );
}

export default function ElectricStudioRoutingDaw() {
  const [channels, setChannels] = useState(initialChannels);
  const [selectedId, setSelectedId] = useState(initialChannels[0].id);
  const [auxEnabled, setAuxEnabled] = useState(true);
  const [busMode, setBusMode] = useState<"mix" | "stem" | "print">("mix");
  const [reverbType, setReverbType] = useState("Plate");
  const [delaySync, setDelaySync] = useState("1/4");

  const selected = channels.find((channel) => channel.id === selectedId) ?? channels[0];
  const soloSafeCount = channels.filter((channel) => channel.soloSafe).length;
  const activeInsertCount = channels.reduce((sum, channel) => sum + channel.inserts.filter((slot) => slot.enabled).length, 0);

  function updateChannel(id: string, patch: Partial<Channel>) {
    setChannels((current) => updateById(current, id, patch));
  }

  function toggleInsert(channelId: string, insertId: string) {
    setChannels((current) => current.map((channel) => channel.id === channelId ? {
      ...channel,
      inserts: channel.inserts.map((insert) => insert.id === insertId ? { ...insert, enabled: !insert.enabled } : insert),
    } : channel));
  }

  return (
    <div className="relative h-full overflow-hidden bg-[#05070a] text-white">
      <ElectricStudioMixerDaw />

      <aside className="pointer-events-auto absolute bottom-20 right-3 top-16 z-[70] hidden w-[360px] overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#11151b]/96 shadow-[0_28px_90px_rgba(0,0,0,.68),inset_0_1px_0_rgba(255,255,255,.06)] backdrop-blur-xl xl:block">
        <header className="border-b border-black bg-[linear-gradient(180deg,#2c3139,#171b21)] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.26em] text-cyan-200/70">Routing / Processing</p>
          <h2 className="mt-1 font-display text-xl font-black uppercase tracking-[0.14em] text-white">Console Rack</h2>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[9px] font-black uppercase tracking-widest text-white/45">
            <span className="rounded-lg bg-black/50 p-2">Solo Safe {soloSafeCount}</span>
            <span className="rounded-lg bg-black/50 p-2">Inserts {activeInsertCount}</span>
            <span className="rounded-lg bg-black/50 p-2">Bus {busMode}</span>
          </div>
        </header>

        <div className="max-h-[calc(100%-9rem)] overflow-auto p-4">
          <section className="grid gap-2">
            {channels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => setSelectedId(channel.id)}
                className={cn("flex items-center gap-3 rounded-2xl border p-3 text-left transition", selectedId === channel.id ? "border-cyan-200/60 bg-cyan-300/10" : "border-white/10 bg-black/30 hover:bg-white/[.04]")}
              >
                <span className="h-12 w-2 rounded-full shadow-[0_0_14px_currentColor]" style={{ backgroundColor: channel.color, color: channel.color }} />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-xs uppercase tracking-widest text-white">{channel.name}</b>
                  <small className="text-[10px] uppercase tracking-widest text-white/40">Route: {channel.route} · {channel.soloSafe ? "solo safe" : "normal solo"}</small>
                </span>
              </button>
            ))}
          </section>

          <section className="mt-4 rounded-2xl border border-white/10 bg-black/35 p-4">
            <div className="flex items-center gap-3">
              <span className="h-12 w-2 rounded-full shadow-[0_0_14px_currentColor]" style={{ backgroundColor: selected.color, color: selected.color }} />
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-black uppercase tracking-widest text-white">{selected.name}</h3>
                <p className="text-[10px] uppercase tracking-widest text-white/35">Aux/bus routing and channel processing</p>
              </div>
              <button onClick={() => updateChannel(selected.id, { soloSafe: !selected.soloSafe })} className={cn("rounded-xl px-3 py-2 text-[9px] font-black uppercase tracking-widest", selected.soloSafe ? "bg-cyan-300 text-black" : "bg-[#222832] text-white/55")}>Solo Safe</button>
            </div>

            <label className="mt-4 block text-[10px] font-black uppercase tracking-widest text-white/45">Output Bus</label>
            <select value={selected.route} onChange={(event) => updateChannel(selected.id, { route: event.target.value as Bus })} className="mt-2 w-full rounded-xl border border-white/10 bg-black/70 px-3 py-3 text-xs font-black uppercase tracking-widest text-cyan-100 outline-none">
              {(["Main", "Bus 1", "Bus 2", "Vocal Aux", "FX Return"] as Bus[]).map((bus) => <option key={bus} value={bus}>{bus}</option>)}
            </select>
          </section>

          <section className="mt-4 rounded-2xl border border-white/10 bg-black/35 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-widest text-cyan-100">Sends</h3>
              <button onClick={() => setAuxEnabled((value) => !value)} className={cn("rounded-full px-3 py-1 text-[9px] font-black uppercase", auxEnabled ? "bg-green-300 text-black" : "bg-[#222832] text-white/55")}>Aux {auxEnabled ? "On" : "Off"}</button>
            </div>
            <label className="mt-3 block text-[10px] uppercase tracking-widest text-white/45">Reverb Send {selected.sendReverb}%<input type="range" min="0" max="100" value={selected.sendReverb} onChange={(event) => updateChannel(selected.id, { sendReverb: Number(event.target.value) })} className="w-full accent-pink-300" /></label>
            <label className="mt-3 block text-[10px] uppercase tracking-widest text-white/45">Delay Send {selected.sendDelay}%<input type="range" min="0" max="100" value={selected.sendDelay} onChange={(event) => updateChannel(selected.id, { sendDelay: Number(event.target.value) })} className="w-full accent-cyan-300" /></label>
          </section>

          <section className="mt-4 rounded-2xl border border-white/10 bg-black/35 p-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-yellow-100">Insert / Plugin Slots</h3>
            <div className="mt-3 grid gap-2">
              {selected.inserts.map((insert, index) => (
                <button key={insert.id} onClick={() => toggleInsert(selected.id, insert.id)} className={cn("flex items-center justify-between rounded-xl border px-3 py-3 text-left text-[10px] font-black uppercase tracking-widest", insert.enabled ? "border-green-300/40 bg-green-300/12 text-green-100" : "border-white/10 bg-[#11161d] text-white/45")}>
                  <span>{index + 1}. {insert.name}</span>
                  <span>{insert.enabled ? "On" : "Bypass"}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="mt-4 rounded-2xl border border-white/10 bg-black/35 p-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-cyan-100">EQ</h3>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Knob label="Low" value={selected.eqLow} min={-12} max={12} accent={selected.color} onChange={(value) => updateChannel(selected.id, { eqLow: value })} />
              <Knob label="Mid" value={selected.eqMid} min={-12} max={12} accent={selected.color} onChange={(value) => updateChannel(selected.id, { eqMid: value })} />
              <Knob label="High" value={selected.eqHigh} min={-12} max={12} accent={selected.color} onChange={(value) => updateChannel(selected.id, { eqHigh: value })} />
            </div>
          </section>

          <section className="mt-4 rounded-2xl border border-white/10 bg-black/35 p-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-orange-100">Compressor</h3>
            <label className="mt-3 block text-[10px] uppercase tracking-widest text-white/45">Threshold {selected.compThreshold} dB<input type="range" min="-48" max="0" value={selected.compThreshold} onChange={(event) => updateChannel(selected.id, { compThreshold: Number(event.target.value) })} className="w-full accent-orange-300" /></label>
            <label className="mt-3 block text-[10px] uppercase tracking-widest text-white/45">Ratio {selected.compRatio}:1<input type="range" min="1" max="12" step="0.5" value={selected.compRatio} onChange={(event) => updateChannel(selected.id, { compRatio: Number(event.target.value) })} className="w-full accent-orange-300" /></label>
          </section>

          <section className="mt-4 rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,122,223,.10),rgba(34,211,238,.06))] p-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-pink-100">Reverb / Delay Return</h3>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] font-black uppercase tracking-widest text-white/45">
              <label className="rounded-xl bg-black/45 p-2">Reverb<select value={reverbType} onChange={(event) => setReverbType(event.target.value)} className="mt-1 w-full rounded bg-black p-2 text-pink-100"><option>Plate</option><option>Room</option><option>Hall</option><option>Chamber</option></select></label>
              <label className="rounded-xl bg-black/45 p-2">Delay<select value={delaySync} onChange={(event) => setDelaySync(event.target.value)} className="mt-1 w-full rounded bg-black p-2 text-cyan-100"><option>1/8</option><option>1/4</option><option>1/2</option><option>Dotted 1/8</option></select></label>
            </div>
          </section>
        </div>
      </aside>

      <div className="absolute bottom-[4.7rem] left-3 right-3 z-[65] rounded-2xl border border-white/10 bg-black/82 p-3 text-[10px] font-black uppercase tracking-widest text-white/60 shadow-[0_12px_40px_rgba(0,0,0,.45)] backdrop-blur xl:hidden">
        Routing rack active: solo-safe, aux sends, bus routes, insert slots, EQ, compressor, reverb, and delay are enabled on desktop in the right-side rack.
      </div>
    </div>
  );
}
