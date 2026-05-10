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

  return (
    <section
      className="rounded-2xl border border-tube-300/25 bg-black/40 p-3 font-mono text-[11px]"
      data-studio-section="audio-settings"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-tube-300/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.32em] text-tube-300">
            Pro defaults active
          </span>
          <span className="text-[10px] uppercase tracking-widest text-white/55">
            Audio engine
          </span>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/70 hover:bg-white/10 transition"
          aria-expanded={open}
        >
          {open ? "Hide" : "Show"}
        </button>
      </header>

      {open && (
        <>
          {!stats ? (
            <p className="mt-2 text-white/55">
              Press play, record, or tap a pad to wake the audio engine.
            </p>
          ) : (
            <dl className="mt-2 grid grid-cols-2 gap-y-1.5 text-white/70">
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
            <p className="mt-2 rounded-md border border-amber-400/30 bg-amber-400/5 p-2 text-[10px] leading-snug text-amber-200">
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
