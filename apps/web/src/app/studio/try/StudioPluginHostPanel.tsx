"use client";

import { useMemo, useState } from "react";
import { EMS_PLUGIN_SDK_REGISTRY, multibandCompress, pitchCorrectToScale, renderAutomationFrames, spectralMeter } from "./studioAdvancedDsp";
import { DEFAULT_MASTERING_PLUGIN_CHAIN } from "./studioBrowserAudioGraph";

const DEMO_SAMPLE_RATE = 44100;

function demoSamples() {
  const samples = new Float32Array(DEMO_SAMPLE_RATE / 2);
  for (let i = 0; i < samples.length; i += 1) {
    const t = i / DEMO_SAMPLE_RATE;
    samples[i] = Math.sin(2 * Math.PI * 110 * t) * 0.2 + Math.sin(2 * Math.PI * 880 * t) * 0.08;
  }
  return samples;
}

export function StudioPluginHostPanel() {
  const [enabledPlugins, setEnabledPlugins] = useState(() => new Set(EMS_PLUGIN_SDK_REGISTRY.map((plugin) => plugin.id)));
  const samples = useMemo(() => demoSamples(), []);
  const compressed = useMemo(() => multibandCompress(samples), [samples]);
  const corrected = useMemo(() => pitchCorrectToScale(compressed, DEMO_SAMPLE_RATE), [compressed]);
  const meter = useMemo(() => spectralMeter(corrected, DEMO_SAMPLE_RATE), [corrected]);
  const automationFrames = useMemo(() => renderAutomationFrames([{ parameterId: "master.presence", points: [{ time: 0, value: 0.25 }, { time: 1, value: 0.82 }, { time: 2, value: 0.45 }] }], 2), []);

  const toggle = (pluginId: string) => {
    setEnabledPlugins((current) => {
      const next = new Set(current);
      if (next.has(pluginId)) next.delete(pluginId);
      else next.add(pluginId);
      return next;
    });
  };

  return (
    <section className="rounded-3xl border border-white/10 bg-black/35 p-4 text-white shadow-2xl shadow-black/30 backdrop-blur-xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">EMS Plugin Host</p>
          <h2 className="text-xl font-semibold">Master Rack + Spectral Runtime</h2>
        </div>
        <div className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">{enabledPlugins.size} active plugins</div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {EMS_PLUGIN_SDK_REGISTRY.map((plugin) => (
          <button
            key={plugin.id}
            type="button"
            onClick={() => toggle(plugin.id)}
            className={`rounded-2xl border p-4 text-left transition ${enabledPlugins.has(plugin.id) ? "border-cyan-300/40 bg-cyan-400/10" : "border-white/10 bg-white/5 opacity-60"}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{plugin.name}</p>
                <p className="text-xs uppercase tracking-[0.2em] text-white/45">{plugin.category}</p>
              </div>
              <span className="rounded-full bg-white/10 px-2 py-1 text-xs">{enabledPlugins.has(plugin.id) ? "On" : "Bypass"}</span>
            </div>
            <div className="mt-3 grid gap-2">
              {plugin.parameters.map((param) => (
                <label key={param.id} className="text-xs text-white/65">
                  <span>{param.name}</span>
                  <input className="mt-1 h-1 w-full accent-cyan-300" type="range" min={param.min} max={param.max} step="0.01" defaultValue={param.defaultValue} />
                </label>
              ))}
            </div>
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {Object.entries(meter).map(([band, value]) => (
          <div key={band} className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs uppercase tracking-[0.2em] text-white/45">{band}</p>
            <p className="text-lg font-semibold">{value.toFixed(2)}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
        <p>Default browser mastering graph: {DEFAULT_MASTERING_PLUGIN_CHAIN.map((plugin) => plugin.id).join(" -> ")}</p>
        <p className="mt-1">Automation render frames: {automationFrames.length}</p>
      </div>
    </section>
  );
}

export default StudioPluginHostPanel;
