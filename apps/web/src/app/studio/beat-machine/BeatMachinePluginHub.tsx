"use client";

import { useEffect, useMemo, useState } from "react";

type PluginKind = "web-audio" | "audio-worklet" | "vst-bridge" | "sample-api" | "midi" | "export";
type PluginStatus = "ready" | "needs-setup" | "bridge-ready";

type PluginSlot = {
  id: string;
  name: string;
  kind: PluginKind;
  status: PluginStatus;
  purpose: string;
  route: string;
};

const PLUGIN_SLOTS: PluginSlot[] = [
  { id: "splice", name: "Splice Sound Source", kind: "sample-api", status: "needs-setup", purpose: "Connect/import Splice samples, loops, one-shots, and packs into My Sounds.", route: "OAuth/API connector + manual import fallback" },
  { id: "vst-bridge", name: "Desktop VST3/AU Bridge", kind: "vst-bridge", status: "bridge-ready", purpose: "EMS is ready for a native bridge that hosts VST3/AU plugins outside the browser and routes audio/MIDI back in.", route: "Local companion bridge + WebSocket/WebRTC/MIDI protocol" },
  { id: "web-fx", name: "Web Audio FX Rack", kind: "web-audio", status: "ready", purpose: "Browser-native EQ, filter, compressor, delay, reverb, saturation, meters, and analyzers.", route: "AudioNode chain" },
  { id: "worklet", name: "AudioWorklet DSP Slot", kind: "audio-worklet", status: "needs-setup", purpose: "Low-latency custom DSP modules for smarter instruments and effects.", route: "AudioWorkletProcessor modules" },
  { id: "midi", name: "MIDI Controller / Pad Hardware", kind: "midi", status: "ready", purpose: "Map keyboards, MPDs, beat pads, and controllers to pads, piano roll, and transport.", route: "Web MIDI + manual mapping" },
  { id: "export", name: "DAW Export Bridge", kind: "export", status: "ready", purpose: "Export stems, kit maps, MIDI, sampler maps, and arrangement manifests for FL, Ableton, Logic, Pro Tools, MPC, and Maschine workflows.", route: "JSON/MIDI/WAV/stem manifest" },
];

const FX_CHAIN = [
  { name: "Smart EQ", use: "Auto carve kick/808/sample lanes", status: "ready" },
  { name: "Compressor", use: "Level drums, samples, and bus groups", status: "ready" },
  { name: "Saturation", use: "Make 808s and drums audible on phones", status: "ready" },
  { name: "Limiter", use: "Protect export and preview from clipping", status: "ready" },
];

const BRIDGE_REQUIREMENTS = [
  "Native VST3/AU host runs as a desktop companion app, not inside the browser sandbox.",
  "EMS exchanges MIDI notes, automation, preset data, and rendered audio with the bridge.",
  "Browser-safe plugins use Web Audio / AudioWorklet directly without the native bridge.",
  "Splice and sample APIs feed My Sounds, pads, sampler, and timeline import paths.",
];

function badge(status: PluginStatus) {
  if (status === "ready") return "border-green-300/40 bg-green-300/10 text-green-100";
  if (status === "bridge-ready") return "border-cyan-300/40 bg-cyan-300/10 text-cyan-100";
  return "border-yellow-300/40 bg-yellow-300/10 text-yellow-100";
}

export default function BeatMachinePluginHub() {
  const [spliceState, setSpliceState] = useState("Not connected");
  const [bridgeState, setBridgeState] = useState("Bridge-ready: waiting for desktop companion app");
  const [selectedSlot, setSelectedSlot] = useState("vst-bridge");
  const [expanded, setExpanded] = useState(false);
  const active = useMemo(() => PLUGIN_SLOTS.find((slot) => slot.id === selectedSlot) ?? PLUGIN_SLOTS[0], [selectedSlot]);

  useEffect(() => {
    const saved = window.localStorage.getItem("ems-plugin-hub-state");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { spliceState?: string; bridgeState?: string; expanded?: boolean };
        if (parsed.spliceState) setSpliceState(parsed.spliceState);
        if (parsed.bridgeState) setBridgeState(parsed.bridgeState);
        if (typeof parsed.expanded === "boolean") setExpanded(parsed.expanded);
      } catch {}
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("ems-plugin-hub-state", JSON.stringify({ spliceState, bridgeState, expanded, updatedAt: new Date().toISOString() }));
  }, [spliceState, bridgeState, expanded]);

  function prepareSplice() {
    setSpliceState("Ready for Splice OAuth/API credentials; manual import still works now");
  }

  async function checkBridge() {
    try {
      const controller = new AbortController();
      window.setTimeout(() => controller.abort(), 650);
      await fetch("http://127.0.0.1:4777/health", { signal: controller.signal, mode: "no-cors" });
      setBridgeState("Local VST bridge probe sent to port 4777. If installed, the companion can answer there.");
    } catch {
      setBridgeState("No local bridge detected yet. EMS is ready; install/run the desktop VST bridge companion when built.");
    }
  }

  function exportPluginManifest() {
    const payload = {
      type: "ems-smart-mpc-plugin-manifest",
      splice: { state: spliceState, ingestTarget: "/api/studio/sounds/upload", libraryTarget: "/api/studio/sounds/library" },
      vstBridge: { state: bridgeState, healthPort: 4777, formats: ["VST3", "AU", "AAX via external DAW handoff"], requiresNativeBridge: true, browserDirectNativeVst: false },
      supportedPluginLayers: PLUGIN_SLOTS,
      fxChain: FX_CHAIN,
      bridgeRequirements: BRIDGE_REQUIREMENTS,
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
    <div className="rounded-2xl border border-purple-300/20 bg-black/50 p-2 shadow-[0_0_24px_rgba(168,85,255,.07)]">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto min-w-[220px]">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-purple-200/70">Plugin / VST bridge drawer</p>
          <h2 className="text-sm font-black uppercase tracking-wide text-white sm:text-lg">VST bridge, Splice, Web Audio FX, MIDI, export</h2>
        </div>
        <span className="rounded-full border border-cyan-300/35 bg-cyan-300/10 px-3 py-1 text-[10px] font-black uppercase text-cyan-100">VST bridge-ready</span>
        <button onClick={() => setExpanded(!expanded)} className="rounded-xl border border-purple-300/30 bg-purple-300/10 px-3 py-2 text-[10px] font-black uppercase text-purple-100">{expanded ? "Hide Tools" : "Show Tools"}</button>
        <button onClick={prepareSplice} className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-[10px] font-black uppercase text-cyan-100">Prepare Splice</button>
        <button onClick={() => void checkBridge()} className="rounded-xl border border-yellow-300/30 bg-yellow-300/10 px-3 py-2 text-[10px] font-black uppercase text-yellow-100">Check Bridge</button>
        <button onClick={exportPluginManifest} className="rounded-xl border border-pink-300/30 bg-pink-300/10 px-3 py-2 text-[10px] font-black uppercase text-pink-100">Export Map</button>
      </div>

      {!expanded ? <div className="mt-2 grid gap-2 text-[10px] uppercase text-white/55 md:grid-cols-3">
        <span className="rounded-lg border border-white/10 bg-white/[.03] px-3 py-2">Splice: {spliceState}</span>
        <span className="rounded-lg border border-white/10 bg-white/[.03] px-3 py-2">VST: {bridgeState}</span>
        <span className="rounded-lg border border-white/10 bg-white/[.03] px-3 py-2">Native VST uses desktop bridge; web FX use AudioWorklet/Web Audio.</span>
      </div> : null}

      {expanded ? <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
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
            Native VST3/AU plugins require a desktop bridge because browsers cannot safely load arbitrary native plugin binaries directly. EMS is now structured to support that bridge while keeping Web Audio, AudioWorklet, MIDI, and sample API workflows native to the browser.
          </div>
        </aside>

        <div className="xl:col-span-2 grid gap-2 md:grid-cols-4">
          {FX_CHAIN.map((fx) => <div key={fx.name} className="rounded-lg border border-white/10 bg-white/[.035] p-3">
            <b className="block text-[10px] uppercase text-cyan-100">{fx.name}</b>
            <span className="mt-1 block text-[10px] leading-4 text-white/45">{fx.use}</span>
          </div>)}
        </div>
        <div className="xl:col-span-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {BRIDGE_REQUIREMENTS.map((item) => <div key={item} className="rounded-lg border border-purple-300/15 bg-purple-300/[.04] px-3 py-2 text-[10px] font-black uppercase leading-4 tracking-wider text-purple-100/80">{item}</div>)}
        </div>
      </div> : null}
    </div>
  </section>;
}
