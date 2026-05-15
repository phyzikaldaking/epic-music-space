"use client";

import { useMemo, useState } from "react";
import { EMS_PLUGIN_SDK_REGISTRY, spectralAnalysis, spectralMeter } from "./studioAdvancedDsp";

type PluginState = { id: string; enabled: boolean; order: number; preset: string };

const SAMPLE_RATE = 44100;

function createDemoStereo() {
  const left = new Float32Array(4096);
  const right = new Float32Array(4096);
  for (let index = 0; index < left.length; index += 1) {
    const time = index / SAMPLE_RATE;
    left[index] = Math.sin(2 * Math.PI * 120 * time) * 0.24 + Math.sin(2 * Math.PI * 2400 * time) * 0.08;
    right[index] = Math.sin(2 * Math.PI * 125 * time) * 0.2 + Math.sin(2 * Math.PI * 3800 * time) * 0.1;
  }
  return { left, right };
}

function rms(samples: Float32Array) {
  return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / Math.max(1, samples.length));
}

function lufsApprox(samples: Float32Array) {
  return -0.691 + 10 * Math.log10(Math.max(0.0000001, rms(samples) ** 2));
}

function stereoWidth(left: Float32Array, right: Float32Array) {
  let mid = 0;
  let side = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    mid += Math.abs((left[index] + right[index]) / 2);
    side += Math.abs((left[index] - right[index]) / 2);
  }
  return side / Math.max(0.0001, mid);
}

function savePreset(chain: PluginState[]) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem("ems-plugin-chain-preset", JSON.stringify(chain));
}

function loadPreset(fallback: PluginState[]) {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const parsed = JSON.parse(localStorage.getItem("ems-plugin-chain-preset") ?? "null") as PluginState[] | null;
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export default function StudioSpectralSuitePanel() {
  const initialChain = useMemo(() => EMS_PLUGIN_SDK_REGISTRY.map((plugin, order) => ({ id: plugin.id, enabled: true, order, preset: "Default" })), []);
  const [chain, setChain] = useState(() => loadPreset(initialChain));
  const stereo = useMemo(() => createDemoStereo(), []);
  const mono = useMemo(() => {
    const merged = new Float32Array(stereo.left.length);
    for (let index = 0; index < merged.length; index += 1) merged[index] = (stereo.left[index] + stereo.right[index]) / 2;
    return merged;
  }, [stereo]);
  const fft = useMemo(() => spectralAnalysis(mono, 512).slice(0, 48), [mono]);
  const meter = useMemo(() => spectralMeter(mono, SAMPLE_RATE), [mono]);
  const loudness = useMemo(() => lufsApprox(mono), [mono]);
  const width = useMemo(() => stereoWidth(stereo.left, stereo.right), [stereo]);

  const move = (pluginId: string, direction: -1 | 1) => {
    setChain((current) => {
      const sorted = [...current].sort((a, b) => a.order - b.order);
      const index = sorted.findIndex((plugin) => plugin.id === pluginId);
      const swapIndex = index + direction;
      if (index < 0 || swapIndex < 0 || swapIndex >= sorted.length) return current;
      [sorted[index], sorted[swapIndex]] = [sorted[swapIndex], sorted[index]];
      return sorted.map((plugin, order) => ({ ...plugin, order }));
    });
  };

  const toggle = (pluginId: string) => setChain((current) => current.map((plugin) => plugin.id === pluginId ? { ...plugin, enabled: !plugin.enabled } : plugin));

  return (
    <section className="rounded-3xl border border-cyan-300/20 bg-black/45 p-4 text-white shadow-2xl shadow-cyan-950/20 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">Spectral Suite</p>
          <h2 className="text-2xl font-black uppercase">Plugin Graph + Master Analyzer</h2>
        </div>
        <button onClick={() => savePreset(chain)} className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-xs font-black uppercase text-emerald-200">Save Preset</button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-2xl border border-white/10 bg-white/[.04] p-3">
          <p className="text-xs uppercase tracking-[0.24em] text-white/45">Drag-order proxy</p>
          <div className="mt-3 grid gap-2">
            {[...chain].sort((a, b) => a.order - b.order).map((slot, index) => {
              const plugin = EMS_PLUGIN_SDK_REGISTRY.find((item) => item.id === slot.id);
              return (
                <div key={slot.id} className="rounded-xl border border-white/10 bg-black/35 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-black uppercase">{index + 1}. {plugin?.name ?? slot.id}</p>
                      <p className="text-xs uppercase tracking-widest text-white/35">{plugin?.category} / {slot.preset}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => move(slot.id, -1)} className="rounded-lg border border-white/10 px-2 py-1 text-xs">Up</button>
                      <button onClick={() => move(slot.id, 1)} className="rounded-lg border border-white/10 px-2 py-1 text-xs">Down</button>
                      <button onClick={() => toggle(slot.id)} className={`rounded-lg border px-2 py-1 text-xs ${slot.enabled ? "border-cyan-300/30 text-cyan-100" : "border-red-300/30 text-red-100"}`}>{slot.enabled ? "On" : "Bypass"}</button>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[10px] uppercase text-white/35">
                    <span className="h-2 w-2 rounded-full bg-cyan-300" /> Browser DSP node
                    <span className="h-px flex-1 bg-white/10" />
                    <span>Automation-ready</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[.04] p-3">
          <p className="text-xs uppercase tracking-[0.24em] text-white/45">Master meters</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/10 bg-black/35 p-3"><p className="text-xs text-white/40">LUFS approx</p><p className="text-2xl font-black">{loudness.toFixed(1)}</p></div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3"><p className="text-xs text-white/40">Stereo width</p><p className="text-2xl font-black">{width.toFixed(2)}</p></div>
            {Object.entries(meter).map(([band, value]) => <div key={band} className="rounded-xl border border-white/10 bg-black/35 p-3"><p className="text-xs uppercase text-white/40">{band}</p><p className="text-lg font-black">{value.toFixed(1)}</p></div>)}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[.04] p-3">
        <div className="flex items-end gap-1 overflow-hidden rounded-xl border border-white/10 bg-black/40 p-2" style={{ height: 150 }}>
          {fft.map((bin, index) => <div key={index} className="flex-1 rounded-t bg-cyan-300/70" style={{ height: `${Math.min(100, bin.magnitude * 80)}%` }} />)}
        </div>
        <div className="mt-3 grid gap-1 overflow-hidden rounded-xl border border-white/10 bg-black/40 p-2">
          {Array.from({ length: 10 }).map((_, row) => (
            <div key={row} className="flex gap-1">
              {fft.slice(0, 36).map((bin, col) => <span key={`${row}-${col}`} className="h-2 flex-1 rounded-sm bg-pink-300/50" style={{ opacity: Math.min(0.85, 0.1 + bin.magnitude * (row + 1) * 0.08) }} />)}
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs uppercase tracking-widest text-white/35">FFT viewport + spectrogram/waterfall rendering foundation</p>
      </div>
    </section>
  );
}
