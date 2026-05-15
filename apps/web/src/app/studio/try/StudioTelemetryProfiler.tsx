"use client";

import { Profiler, type ProfilerOnRenderCallback, useMemo, useState } from "react";

export type StudioTelemetryEvent = {
  id: string;
  phase: "mount" | "update" | "nested-update";
  actualDuration: number;
  baseDuration: number;
  startTime: number;
  commitTime: number;
  target: "waveform" | "transport" | "plugin-rack" | "spectral-meter" | "mixer" | "timeline";
};

export const STUDIO_TELEMETRY_TARGETS = ["waveform", "transport", "plugin-rack", "spectral-meter", "mixer", "timeline"] as const;

export function useStudioTelemetryProfiler() {
  const [events, setEvents] = useState<StudioTelemetryEvent[]>([]);
  const onRender: ProfilerOnRenderCallback = (id, phase, actualDuration, baseDuration, startTime, commitTime) => {
    if (process.env.NEXT_PUBLIC_STUDIO_PROFILER !== "1") return;
    const target = STUDIO_TELEMETRY_TARGETS.includes(id as StudioTelemetryEvent["target"]) ? id as StudioTelemetryEvent["target"] : "timeline";
    const event = { id, target, phase, actualDuration, baseDuration, startTime, commitTime };
    setEvents((current) => [...current.slice(-79), event]);
    if (actualDuration > 12) console.warn("[StudioProfiler] slow render", event);
  };
  const summary = useMemo(() => STUDIO_TELEMETRY_TARGETS.map((target) => {
    const scoped = events.filter((event) => event.target === target);
    const slow = scoped.filter((event) => event.actualDuration > 12).length;
    const average = scoped.length ? scoped.reduce((sum, event) => sum + event.actualDuration, 0) / scoped.length : 0;
    return { target, count: scoped.length, slow, average };
  }), [events]);
  return { events, summary, onRender };
}

export function StudioTelemetryProfiler({ id, onRender, children }: { id: StudioTelemetryEvent["target"]; onRender: ProfilerOnRenderCallback; children: React.ReactNode }) {
  return <Profiler id={id} onRender={onRender}>{children}</Profiler>;
}

export function StudioTelemetryPanel({ summary }: { summary: Array<{ target: string; count: number; slow: number; average: number }> }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-black/35 p-4 text-white shadow-2xl shadow-black/30 backdrop-blur-xl">
      <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">Profiler Telemetry</p>
      <h2 className="text-xl font-semibold">Frame Budget Targets</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {summary.map((item) => (
          <div key={item.target} className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs uppercase tracking-[0.2em] text-white/45">{item.target}</p>
            <p className="text-lg font-semibold">{item.average.toFixed(2)}ms</p>
            <p className="text-xs text-white/45">{item.count} commits / {item.slow} slow</p>
          </div>
        ))}
      </div>
    </section>
  );
}
