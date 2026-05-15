"use client";

import { Component, type ErrorInfo, type ReactNode, useEffect, useMemo, useRef, useState } from "react";

type RuntimeSeverity = "green" | "yellow" | "orange" | "red";

type RuntimeEvent = {
  type: "error" | "unhandledrejection" | "hydration" | "fps" | "memory" | "anomaly";
  message: string;
  route: string;
  timestamp: string;
  severity: RuntimeSeverity;
  detail?: Record<string, unknown>;
};

type RuntimeMetrics = {
  fps: number;
  longFrameCount: number;
  heapUsedMB: number | null;
  heapLimitMB: number | null;
  anomalyScore: number;
  severity: RuntimeSeverity;
};

const ENABLED = process.env.NEXT_PUBLIC_STUDIO_OBSERVABILITY !== "0";
const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const EVENT_LIMIT = 20;

function getRoute() {
  if (typeof window === "undefined") return "server";
  return `${window.location.pathname}${window.location.search}`;
}

function toSeverity(score: number): RuntimeSeverity {
  if (score >= 85) return "red";
  if (score >= 65) return "orange";
  if (score >= 35) return "yellow";
  return "green";
}

function getMemorySnapshot(): Pick<RuntimeMetrics, "heapUsedMB" | "heapLimitMB"> {
  if (typeof performance === "undefined") return { heapUsedMB: null, heapLimitMB: null };
  const perf = performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } };
  if (!perf.memory) return { heapUsedMB: null, heapLimitMB: null };
  return {
    heapUsedMB: Math.round(perf.memory.usedJSHeapSize / 1024 / 1024),
    heapLimitMB: Math.round(perf.memory.jsHeapSizeLimit / 1024 / 1024),
  };
}

function pushRuntimeEvent(event: RuntimeEvent) {
  if (typeof window === "undefined") return;
  const target = window as Window & { __EMS_RUNTIME_EVENTS__?: RuntimeEvent[] };
  target.__EMS_RUNTIME_EVENTS__ = [event, ...(target.__EMS_RUNTIME_EVENTS__ ?? [])].slice(0, EVENT_LIMIT);

  if (SENTRY_DSN) {
    // Production handoff point for Sentry browser SDK ingestion. The app can swap this console call for Sentry.captureMessage/captureException once @sentry/nextjs is installed and configured.
    console.warn("[EMS:SENTRY_HANDOFF]", event);
  }
}

function createRuntimeEvent(type: RuntimeEvent["type"], message: string, severity: RuntimeSeverity, detail?: Record<string, unknown>): RuntimeEvent {
  return { type, message, route: getRoute(), timestamp: new Date().toISOString(), severity, detail };
}

class StudioRuntimeErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; eventId: string | null }> {
  state = { error: null, eventId: null };

  static getDerivedStateFromError(error: Error) {
    return { error, eventId: `${Date.now()}` };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    pushRuntimeEvent(createRuntimeEvent("error", error.message || "Studio runtime crashed", "red", {
      stack: error.stack,
      componentStack: info.componentStack,
    }));
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="min-h-[520px] min-w-[960px] rounded-2xl border border-red-300/30 bg-red-950/30 p-6 text-white shadow-[0_0_40px_rgba(255,0,80,.18)]">
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-red-200/75">Studio Runtime Guard</p>
        <h2 className="mt-2 text-3xl font-black uppercase tracking-wider text-red-100">Protected crash captured</h2>
        <p className="mt-3 max-w-3xl text-sm text-white/65">The broken Studio region was isolated so the rest of the app can keep running. Reload this screen after the next deployment or continue using another EMS section.</p>
        <pre className="mt-4 max-h-44 overflow-auto rounded-xl border border-white/10 bg-black/60 p-3 text-xs text-red-100">{this.state.error.message}</pre>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => this.setState({ error: null, eventId: null })} className="rounded-full border border-cyan-300/40 bg-cyan-300/10 px-4 py-2 text-xs font-black uppercase tracking-widest text-cyan-100">Try recover</button>
          <button onClick={() => window.location.reload()} className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-widest text-white/75">Reload Studio</button>
        </div>
      </section>
    );
  }
}

export function StudioRuntimeObservability({ mode, children }: { mode: string; children: ReactNode }) {
  const [events, setEvents] = useState<RuntimeEvent[]>([]);
  const [metrics, setMetrics] = useState<RuntimeMetrics>({ fps: 60, longFrameCount: 0, heapUsedMB: null, heapLimitMB: null, anomalyScore: 0, severity: "green" });
  const frameRef = useRef({ last: 0, frames: 0, longFrames: 0, fps: 60, raf: 0 });

  useEffect(() => {
    if (!ENABLED || typeof window === "undefined") return;

    const syncEvents = () => {
      const target = window as Window & { __EMS_RUNTIME_EVENTS__?: RuntimeEvent[] };
      setEvents([...(target.__EMS_RUNTIME_EVENTS__ ?? [])]);
    };

    const onError = (event: ErrorEvent) => {
      pushRuntimeEvent(createRuntimeEvent("error", event.message || "window.onerror", "red", {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
        studioMode: mode,
      }));
      syncEvents();
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
      pushRuntimeEvent(createRuntimeEvent("unhandledrejection", reason || "Unhandled promise rejection", "orange", { studioMode: mode }));
      syncEvents();
    };

    const consoleError = console.error;
    console.error = (...args: unknown[]) => {
      const message = args.map((arg) => typeof arg === "string" ? arg : JSON.stringify(arg)).join(" ");
      if (/hydration|did not match|server rendered|client rendered/i.test(message)) {
        pushRuntimeEvent(createRuntimeEvent("hydration", message.slice(0, 500), "orange", { studioMode: mode }));
        syncEvents();
      }
      consoleError(...args);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      console.error = consoleError;
    };
  }, [mode]);

  useEffect(() => {
    if (!ENABLED || typeof window === "undefined") return;
    const state = frameRef.current;

    const tick = (now: number) => {
      if (!state.last) state.last = now;
      const delta = now - state.last;
      state.last = now;
      state.frames += 1;
      if (delta > 50) state.longFrames += 1;
      state.fps = Math.round(1000 / Math.max(delta, 1));
      state.raf = window.requestAnimationFrame(tick);
    };

    const interval = window.setInterval(() => {
      const memory = getMemorySnapshot();
      const memoryPressure = memory.heapUsedMB && memory.heapLimitMB ? Math.min(100, Math.round((memory.heapUsedMB / memory.heapLimitMB) * 100)) : 0;
      const fpsPenalty = Math.max(0, 60 - state.fps) * 1.2;
      const longFramePenalty = Math.min(40, state.longFrames * 2);
      const anomalyScore = Math.min(100, Math.round(fpsPenalty + longFramePenalty + memoryPressure * 0.35));
      const severity = toSeverity(anomalyScore);
      const next = { fps: state.fps, longFrameCount: state.longFrames, heapUsedMB: memory.heapUsedMB, heapLimitMB: memory.heapLimitMB, anomalyScore, severity };
      setMetrics(next);
      if (severity === "orange" || severity === "red") {
        pushRuntimeEvent(createRuntimeEvent("anomaly", `Studio anomaly score ${anomalyScore}`, severity, { ...next, studioMode: mode }));
      }
      state.longFrames = 0;
    }, 2500);

    state.raf = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(state.raf);
      window.clearInterval(interval);
    };
  }, [mode]);

  const hudClass = useMemo(() => {
    if (metrics.severity === "red") return "border-red-300/50 bg-red-950/70 text-red-100";
    if (metrics.severity === "orange") return "border-orange-300/50 bg-orange-950/70 text-orange-100";
    if (metrics.severity === "yellow") return "border-yellow-300/50 bg-yellow-950/60 text-yellow-100";
    return "border-emerald-300/35 bg-emerald-950/35 text-emerald-100";
  }, [metrics.severity]);

  return (
    <StudioRuntimeErrorBoundary>
      <div data-testid="studio-observability-root" data-runtime-severity={metrics.severity} className="relative">
        {children}
        {ENABLED ? (
          <aside data-testid="studio-performance-hud" className={`fixed bottom-24 left-3 z-[140] w-[260px] rounded-2xl border p-3 text-[10px] shadow-[0_0_30px_rgba(0,0,0,.35)] backdrop-blur ${hudClass}`}>
            <div className="flex items-center justify-between gap-2">
              <b className="uppercase tracking-[0.22em]">Studio Telemetry</b>
              <span className="rounded-full border border-white/15 px-2 py-0.5 uppercase">{metrics.severity}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-white/75">
              <span>FPS {metrics.fps}</span>
              <span>Score {metrics.anomalyScore}</span>
              <span>Long {metrics.longFrameCount}</span>
              <span>Heap {metrics.heapUsedMB ?? "n/a"}MB</span>
            </div>
            {events.length ? <p className="mt-2 truncate text-white/50">Last: {events[0]?.message}</p> : <p className="mt-2 text-white/45">No runtime errors captured.</p>}
          </aside>
        ) : null}
      </div>
    </StudioRuntimeErrorBoundary>
  );
}
