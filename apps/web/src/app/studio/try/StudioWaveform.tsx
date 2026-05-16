"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import type { WaveformPeaks } from "./studioWorkstationTypes";

type WaveformTile = {
  upperPoints: string;
  lowerPoints: string;
  pathKey: string;
};

type StudioWaveformProps = {
  color: string;
  row: number;
  tiles?: number;
  tileStart?: number;
  playing?: boolean;
  waveform?: WaveformPeaks;
};

const waveformTileCache = new Map<string, WaveformTile>();
const MAX_WAVEFORM_TILES = 256;

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
      for (let sample = start; sample < end; sample += 1) {
        max = Math.max(max, Math.abs(data[sample] ?? 0));
      }
    }
    peaks.push(Number(max.toFixed(4)));
  }

  return { peaks, durationSec: buffer.duration, sampleRate: buffer.sampleRate };
}

function buildDemoWavePoints(row: number, invert = false, tile = 0) {
  return Array.from({ length: 70 }, (_, i) => {
    const x = i * 1.45;
    const phase = i + tile * 70;
    const y = 20 + (invert ? -1 : 1) * (Math.sin(phase * (0.7 + row * 0.08)) * (5 + (phase % 9)) + Math.cos(phase * 0.31) * 4);
    return `${x},${y}`;
  }).join(" ");
}

function getWaveformTile(row: number, tile: number): WaveformTile {
  const key = `${row}:${tile}`;
  const cached = waveformTileCache.get(key);
  if (cached) return cached;
  const value = {
    upperPoints: buildDemoWavePoints(row, false, tile),
    lowerPoints: buildDemoWavePoints(row, true, tile),
    pathKey: key,
  };
  waveformTileCache.set(key, value);
  if (waveformTileCache.size > MAX_WAVEFORM_TILES) {
    const oldest = waveformTileCache.keys().next().value;
    if (oldest) waveformTileCache.delete(oldest);
  }
  return value;
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

function DemoPlaceholderWaveform({ color, row, tiles = 1, tileStart = 0, playing = true }: Omit<StudioWaveformProps, "waveform">) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const safeTiles = Math.max(1, Math.min(8, tiles));
  const safeTileStart = Math.max(0, tileStart);
  const tileData = useMemo(() => Array.from({ length: safeTiles }, (_, tile) => getWaveformTile(row, safeTileStart + tile)), [row, safeTiles, safeTileStart]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.dataset.renderer = typeof OffscreenCanvas !== "undefined" ? "demo-offscreen-ready" : "demo-svg-cached";
    let frame = 0;
    let raf = 0;
    const animate = () => {
      frame += playing ? 0.65 : 0.12;
      svg.style.setProperty("--wave-shift", `${-(frame % 120)}px`);
      svg.style.setProperty("--wave-pulse", `${0.52 + Math.sin(frame / 18) * 0.08}`);
      raf = window.requestAnimationFrame(animate);
    };
    raf = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(raf);
  }, [playing]);

  return (
    <svg ref={svgRef} className="absolute inset-0 h-full w-full will-change-transform [contain:layout_paint]" preserveAspectRatio="none" viewBox={`0 0 ${100 * safeTiles} 40`} aria-hidden="true" data-waveform-source="demo-placeholder-only">
      <defs>
        <filter id={`wave-demo-glow-${row}`} x="-20%" y="-80%" width="140%" height="260%">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g style={{ transform: "translate3d(var(--wave-shift, 0px), 0, 0)", opacity: "var(--wave-pulse, .55)" }}>
        {tileData.map((tile, index) => (
          <g key={tile.pathKey} transform={`translate(${index * 100} 0)`} filter={`url(#wave-demo-glow-${row})`}>
            <polyline points={tile.upperPoints} fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity=".58" />
            <polyline points={tile.lowerPoints} fill="none" stroke={color} strokeWidth="0.85" strokeLinecap="round" opacity=".32" />
          </g>
        ))}
        {tileData.map((tile, index) => (
          <g key={`${tile.pathKey}-loop`} transform={`translate(${index * 100 + safeTiles * 100} 0)`} filter={`url(#wave-demo-glow-${row})`}>
            <polyline points={tile.upperPoints} fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity=".58" />
            <polyline points={tile.lowerPoints} fill="none" stroke={color} strokeWidth="0.85" strokeLinecap="round" opacity=".32" />
          </g>
        ))}
      </g>
      <text x="6" y="36" fill="rgba(255,255,255,.36)" fontSize="5" fontWeight="800" letterSpacing="1.1">DEMO PLACEHOLDER ONLY</text>
    </svg>
  );
}

function StudioWaveform({ color, row, tiles = 1, tileStart = 0, playing = true, waveform }: StudioWaveformProps) {
  if (waveform?.peaks?.length) return <PeakWaveform color={color} waveform={waveform} />;
  return <DemoPlaceholderWaveform color={color} row={row} tiles={tiles} tileStart={tileStart} playing={playing} />;
}

export default memo(StudioWaveform);
