"use client";

import { useEffect, useState } from "react";
import { StudioTooltip } from "@/components/ui/StudioTooltip";
import { tooltips } from "./tooltipCopy";

interface AudioSettingsPanelProps {
  ctx: AudioContext | null;
  latencyMode: "recording" | "mixing" | "mastering";
}

interface Stats {
  sampleRate: number;
  channels: number;
  baseLatency: number | null;
  outputLatency: number | null;
  state: AudioContextState;
}

function readStats(ctx: AudioContext): Stats {
  const c = ctx as AudioContext & { baseLatency?: number; outputLatency?: number };
  return {
    sampleRate: ctx.sampleRate,
    channels: ctx.destination.channelCount,
    baseLatency: typeof c.baseLatency === "number" ? c.baseLatency : null,
    outputLatency: typeof c.outputLatency === "number" ? c.outputLatency : null,
    state: ctx.state,
  };
}

export default function AudioSettingsPanel({ ctx, latencyMode }: AudioSettingsPanelProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!ctx) {
      setStats(null);
      return;
    }
    setStats(readStats(ctx));
    const id = window.setInterval(() => setStats(readStats(ctx)), 1500);
    return () => window.clearInterval(id);
  }, [ctx]);

  const sampleRateOk = stats ? stats.sampleRate >= 48000 : true;
  const latencyLabel =
    latencyMode === "recording"
      ? "REC"
      : latencyMode === "mastering"
        ? "MASTER"
        : "MIX";

  return (
    <section
      className="rounded-lg border border-white/10 bg-black/45 px-2 py-1.5 font-mono text-[10px]"
      data-studio-section="audio-settings"
    >
      <header className="flex min-h-7 items-center gap-1.5">
        <span className="rounded bg-tube-300/15 px-1.5 py-0.5 font-black uppercase tracking-[0.16em] text-tube-300">
          Engine
        </span>
        <span className={sampleRateOk ? "text-cyan-100" : "text-amber-200"}>
          {stats ? `${(stats.sampleRate / 1000).toFixed(0)}k` : "sleep"}
        </span>
        <span className="text-white/25">/</span>
        <span className="text-white/65">32f</span>
        <span className="text-white/25">/</span>
        <span className="text-white/65">{latencyLabel}</span>
        <span className={stats?.state === "running" ? "ml-auto rounded bg-emerald-400/15 px-1.5 py-0.5 uppercase text-emerald-200" : "ml-auto rounded bg-white/10 px-1.5 py-0.5 uppercase text-white/55"}>
          {stats?.state ?? "idle"}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded border border-white/10 px-1.5 py-0.5 font-bold uppercase tracking-wider text-white/55 hover:bg-white/10"
          aria-expanded={open}
        >
          {open ? "Less" : "More"}
        </button>
      </header>

      {open && (
        <>
          {!stats ? (
            <p className="mt-1 text-white/55">
              Press play, record, or tap a pad to wake the audio engine.
            </p>
          ) : (
            <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 border-t border-white/10 pt-1 text-[10px] text-white/70">
              <StudioTooltip label={tooltips.audioSampleRate}>
                <dt className="cursor-help">Sample rate</dt>
              </StudioTooltip>
              <dd className={sampleRateOk ? "text-tube-300" : "text-amber-300"}>
                {stats.sampleRate.toLocaleString()} Hz
              </dd>

              <StudioTooltip label={tooltips.audioBitDepth}>
                <dt className="cursor-help">Internal precision</dt>
              </StudioTooltip>
              <dd>32-bit float</dd>

              <dt>Export bit depth</dt>
              <dd>24-bit PCM</dd>

              <StudioTooltip label={tooltips.audioLatency}>
                <dt className="cursor-help">Latency hint</dt>
              </StudioTooltip>
              <dd>
                {latencyMode === "recording"
                  ? "Interactive (low-latency)"
                  : latencyMode === "mastering"
                    ? "Playback (stable)"
                    : "Balanced"}
              </dd>

              <dt>Output channels</dt>
              <dd>{stats.channels}</dd>

              <dt>Base latency</dt>
              <dd>
                {stats.baseLatency !== null
                  ? `${(stats.baseLatency * 1000).toFixed(1)} ms`
                  : "—"}
              </dd>

              <dt>Output latency</dt>
              <dd>
                {stats.outputLatency !== null
                  ? `${(stats.outputLatency * 1000).toFixed(1)} ms`
                  : "—"}
              </dd>

              <dt>Engine state</dt>
              <dd className="capitalize">{stats.state}</dd>
            </dl>
          )}

          {stats && !sampleRateOk && (
            <p className="mt-1 rounded border border-amber-400/30 bg-amber-400/5 p-1.5 text-[10px] leading-snug text-amber-200">
              Your audio device is running at {stats.sampleRate.toLocaleString()} Hz.
              Recordings will use the device&apos;s rate — pitch and length are
              still correct, but exports may not hit the 48 kHz pro target.
            </p>
          )}
        </>
      )}
    </section>
  );
}
