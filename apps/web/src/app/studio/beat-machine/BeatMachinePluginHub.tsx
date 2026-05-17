"use client";

import { useEffect, useMemo, useState } from "react";

type PluginKind = "web-audio" | "audio-worklet" | "vst-bridge" | "sample-api" | "midi" | "export";
type PluginStatus = "ready" | "needs-setup" | "planned";

type PluginSlot = {
  id: string;
  name: string;
  kind: PluginKind;
  status: PluginStatus;
  purpose: string;
  route: string;
};

const PLUGIN_SLOTS: PluginSlot[] = [
  { id: "splice", name: "Splice Sound Source", kind: "sample-api", status: "needs-setup", purpose: "Connect / import Splice samples, loops, one-shots, and packs into My Sounds.", route: "OAuth/API connector + fallback manual import" },
  { id: "vst-bridge", name: "Desktop VST3/AU Bridge", kind: "vst-bridge", status: "planned", purpose: "Host native VST3/AU plugins through a local desktop bridge and stream audio/MIDI back to EMS.", route: "Local companion app / bridge protocol" },
  { id: "web-fx", name: "Web Audio FX Rack", kind: "web-audio", status: "ready", purpose: "Browser-native EQ, filter, compressor, delay, reverb, saturation, meters, and analyzers.", route: "AudioNode chain" },
  { id: "worklet", name: "AudioWorklet DSP Slot", kind: "audio-worklet", status: "needs-setup", purpose: "Low-latency custom DSP modules for smarter instruments and effects.", route: "AudioWorkletProcessor modules" },
  { id: "midi", name: "MIDI Controller / Pad Hardware", kind: "midi", status: "ready", purpose: "Map external keyboards, MPDs, beat pads, and controllers to pads, piano roll, and transport.", route: "Web MIDI + manual mapping" },
  { id: "export", name: "DAW Export Bridge", kind: "export", status: "ready", purpose: "Export stems, kit maps, MIDI, sampler maps, and arrangement manifests for FL, Ableton, Logic, Pro Tools, MPC, and Maschine workflows.", route: "JSON/MIDI/WAV/stem manifest" },
];

const FX_CHAIN = [
  { name: "Smart EQ", use: "Auto carve kick/808/sample lanes", status: "ready" },
  { name: "Compressor", use: "Level drums, samples, and bus groups", status: "ready" },
  { name: "Saturation", use: "Make 808s and drums audible on phones", status: "ready" },
  { name: "Transient Shaper", use: "Punch kicks/snares or soften samples", status: "planned" },
  { name: "Limiter", use: "Protect export and preview from clipping", status: "ready" },
  { name: "Spectrum Analyzer", use: "Show frequency collisions and tone balance", status: "planned" },
];

const CONNECTOR_PLAN = [
  "Splice: OAuth/API connector when credentials are available; manual import always available.",
  "Loopcloud/Sounds.com-style providers: add as sample-api slots with the same My Sounds ingest path.",
  "VST3/AU: support through desktop bridge, not direct browser-only loading.",
  "Web-native plugins: load as AudioWorklet/WebAssembly DSP modules.",
  "Hardware: Web MIDI mapping for keyboards, MPDs, drum pads, and control surfaces.",
  "DAW handoff: export stems, MIDI, kit maps, sampler maps, and arrangement manifests.",
];

function badge(status: PluginStatus) {
  if (status === "ready") return "border-green-300/40 bg-green-300/10 text-green-100";
  if (status === "needs-setup") return "border-yellow-300/40 bg-yellow-300/10 text-yellow-100";
  return "border-white/15 bg-white/[.04] text-white/50";
}

export default function BeatMachinePluginHub() {
  const [spliceState, setSpliceState] = useState("Not connected");
  const [bridgeState, setBridgeState] = useState("Bridge not installed");
  const [selectedSlot, setSelectedSlot] = useState("splice");
  const active = useMemo(() => PLUGIN_SLOTS.find((slot) => slot.id === selectedSlot) ?? PLUGIN_SLOTS[0], [selectedSlot]);

  useEffect(() => {
    const saved = window.localStorage.getItem("ems-plugin-hub-state");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { spliceState?: string; bridgeState?: string };
        if (parsed.spliceState) setSpliceState(parsed.spliceState);
        if (parsed.bridgeState) setBridgeState(parsed.bridgeState);
      } catch {}
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("ems-plugin-hub-state", JSON.stringify({ spliceState, bridgeState, updatedAt: new Date().toISOString() }));
  }, [spliceState, bridgeState]);

  function connectSplicePlaceholder() {
    setSpliceState("Ready for Splice OAuth/API credentials or manual sample import");
  }

  function checkBridgePlaceholder() {
    setBridgeState("Waiting for desktop VST bridge app / local host service");
  }

  function exportPluginManifest() {
    const payload = {
      type: "ems-smart-mpc-plugin-manifest",
      splice: { state: spliceState, ingestTarget: "/api/studio/sounds/upload", libraryTarget: "/api/studio/sounds/library" },
      vstBridge: { state: bridgeState, formats: ["VST3", "AU", "AAX via external DAW handoff"], requiresNativeBridge: true },
      supportedPluginLayers: PLUGIN_SLOTS,
      fxChain: FX_CHAIN,
      connectorPlan: CONNECTOR_PLAN,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ems-smart-mpc-plugin-manifest.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return <section className="mx-auto mb-2 max-w-[1900px] px-2 sm:px-4">
    <div className="rounded-2xl border border-purple-300/20 bg-black/55 p-3 shadow-[0_0_28px_rgba(168,85,255,.08)]">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-purple-200/70">Plugin-ready Smart MPC hub</p>
          <h2 className="text-lg font-black uppercase tracking-wide text-white sm:text-2xl">Splice, VST bridge, Web Audio FX, MIDI, API sources</h2>
        </div>
        <button onClick={connectSplicePlaceholder} className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-[10px] font-black uppercase text-cyan-100">Prepare Splice</button>
        <button onClick={checkBridgePlaceholder} className="rounded-xl border border-yellow-300/30 bg-yellow-300/10 px-3 py-2 text-[10px] font-black uppercase text-yellow-100">Check VST Bridge</button>
        <button onClick={exportPluginManifest} className="rounded-xl border border-pink-300/30 bg-pink-300/10 px-3 py-2 text-[10px] font-black uppercase text-pink-100">Export Plugin Map</button>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {PLUGIN_SLOTS.map((slot) => <button key={slot.id} onClick={() => setSelectedSlot(slot.id)} className={`rounded-xl border p-3 text-left transition ${selectedSlot === slot.id ? "border-purple-300 bg-purple-300/10" : "border-white/10 bg-white/[.035]"}`}>
            <div className="flex items-center justify-between gap-2">
              <b className="text-xs uppercase text-purple-100">{slot.name}</b>
              <span className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase ${badge(slot.status)}`}>{slot.status}</span>
            </div>
            <p className="mt-2 text-[11px] leading-4 text-white/55">{slot.purpose}</p>
            <p className="mt-2 text-[9px] font-black uppercase tracking-wider text-white/35">{slot.route}</p>
          </button>)}
        </div>

        <aside className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/45">Selected slot</p>
          <h3 className="mt-2 text-sm font-black uppercase text-white">{active.name}</h3>
          <p className="mt-2 text-xs leading-5 text-white/55">{active.purpose}</p>
          <div className="mt-3 space-y-2 text-[11px] text-white/55">
            <p><b className="text-cyan-100">Splice:</b> {spliceState}</p>
            <p><b className="text-yellow-100">VST Bridge:</b> {bridgeState}</p>
          </div>
          <div className="mt-3 rounded-lg border border-white/10 bg-white/[.03] p-3 text-[11px] leading-5 text-white/50">
            Native VST3/AU plugins require a desktop bridge because browsers cannot safely load arbitrary native plugin binaries directly. EMS can still be plugin-ready through Web Audio, AudioWorklet/WebAssembly DSP, MIDI mapping, sample APIs, and a companion bridge for native desktop plugins.
          </div>
        </aside>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        {FX_CHAIN.map((fx) => <div key={fx.name} className="rounded-lg border border-white/10 bg-white/[.035] p-3">
          <b className="block text-[10px] uppercase text-cyan-100">{fx.name}</b>
          <span className="mt-1 block text-[10px] leading-4 text-white/45">{fx.use}</span>
          <span className={`mt-2 inline-block rounded-full border px-2 py-1 text-[8px] uppercase ${fx.status === "ready" ? "border-green-300/40 text-green-100" : "border-white/15 text-white/45"}`}>{fx.status}</span>
        </div>)}
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {CONNECTOR_PLAN.map((item) => <div key={item} className="rounded-lg border border-purple-300/15 bg-purple-300/[.04] px-3 py-2 text-[10px] font-black uppercase leading-4 tracking-wider text-purple-100/80">{item}</div>)}
      </div>
    </div>
  </section>;
}
