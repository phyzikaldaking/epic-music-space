"use client";

import { memo, useMemo } from "react";
import type { WaveformPeaks } from "./studioWorkstationTypes";

type StudioWaveformProps = {
  color: string;
  row?: number;
  tiles?: number;
  tileStart?: number;
  playing?: boolean;
  waveform?: WaveformPeaks;
  emptyLabel?: string;
};

export function buildWaveformPeaksFromAudioBuffer(buffer: AudioBuffer, targetPeaks = 512): WaveformPeaks {
  const channelCount = buffer.numberOfChannels;
  const samplesPerPeak = Math.max(1, Math.floor(buffer.length / targetPeaks));
  const peaks: number[] = [];

  for (let peakIndex = 0; peakIndex < targetPeaks; peakIndex += 1) {
    const start = peakIndex * samplesPerPeak;
    const end = Math.min(buffer.length, start + samplesPerPeak);
    let max = 0;
    for (let channel = 0; channel < channelCount; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let sample = start; sample < end; sample += 1) max = Math.max(max, Math.abs(data[sample] ?? 0));
    }
    peaks.push(Number(max.toFixed(4)));
  }

  return { peaks, durationSec: buffer.duration, sampleRate: buffer.sampleRate };
}

function clampPeak(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, Math.abs(value)));
}

function PeakWaveform({ color, waveform }: { color: string; waveform: WaveformPeaks }) {
  const safePeaks = useMemo(() => waveform.peaks.map(clampPeak).filter((peak) => Number.isFinite(peak)), [waveform.peaks]);
  const peaks = safePeaks.length ? safePeaks : [0];
  const width = Math.max(100, peaks.length * 3);
  const center = 20;
  const barWidth = Math.max(1.2, width / peaks.length - 1);

  return (
    <svg className="absolute inset-0 h-full w-full [contain:layout_paint]" preserveAspectRatio="none" viewBox={`0 0 ${width} 40`} aria-hidden="true" data-waveform-source="audio-peaks" data-duration-sec={waveform.durationSec}>
      <defs>
        <filter id={`audio-peak-glow-${Math.round(width)}`} x="-20%" y="-80%" width="140%" height="260%">
          <feGaussianBlur stdDeviation="1.7" result="coloredBlur" />
          <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g filter={`url(#audio-peak-glow-${Math.round(width)})`}>
        {peaks.map((peak, index) => {
          const height = Math.max(1.2, peak * 34);
          return <rect key={`${index}-${peak}`} x={index * (barWidth + 1)} y={center - height / 2} width={barWidth} height={height} rx="1" fill={color} opacity={0.42 + peak * 0.58} />;
        })}
      </g>
      <line x1="0" x2={width} y1={center} y2={center} stroke={color} strokeOpacity="0.28" strokeWidth="0.6" />
    </svg>
  );
}

function EmptyWaveform({ color, label = "No decoded audio waveform" }: { color: string; label?: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center overflow-hidden rounded bg-black/25" data-waveform-source="empty-no-fake-waveform">
      <div className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2 opacity-40" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
      <span className="relative rounded-full border border-white/10 bg-black/55 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white/35">
        {label}
      </span>
    </div>
  );
}

function StudioWaveform({ color, waveform, emptyLabel }: StudioWaveformProps) {
  if (waveform?.peaks?.length) return <PeakWaveform color={color} waveform={waveform} />;
  return <EmptyWaveform color={color} label={emptyLabel} />;
}

export default memo(StudioWaveform);
