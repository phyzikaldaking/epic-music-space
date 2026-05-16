"use client";

import { memo, useEffect, useMemo, useRef } from "react";

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
};

const waveformTileCache = new Map<string, WaveformTile>();
const MAX_WAVEFORM_TILES = 256;

function buildWavePoints(row: number, invert = false, tile = 0) {
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
    upperPoints: buildWavePoints(row, false, tile),
    lowerPoints: buildWavePoints(row, true, tile),
    pathKey: key,
  };
  waveformTileCache.set(key, value);
  if (waveformTileCache.size > MAX_WAVEFORM_TILES) {
    const oldest = waveformTileCache.keys().next().value;
    if (oldest) waveformTileCache.delete(oldest);
  }
  return value;
}

function StudioWaveform({ color, row, tiles = 1, tileStart = 0, playing = true }: StudioWaveformProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const safeTiles = Math.max(1, Math.min(8, tiles));
  const safeTileStart = Math.max(0, tileStart);
  const tileData = useMemo(() => Array.from({ length: safeTiles }, (_, tile) => getWaveformTile(row, safeTileStart + tile)), [row, safeTiles, safeTileStart]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.dataset.renderer = typeof OffscreenCanvas !== "undefined" ? "offscreen-ready" : "svg-cached";
    let frame = 0;
    let raf = 0;
    const animate = () => {
      frame += playing ? 1.35 : 0.28;
      svg.style.setProperty("--wave-shift", `${-(frame % 120)}px`);
      svg.style.setProperty("--wave-pulse", `${0.78 + Math.sin(frame / 12) * 0.18}`);
      raf = window.requestAnimationFrame(animate);
    };
    raf = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(raf);
  }, [playing]);

  return (
    <svg ref={svgRef} className="absolute inset-0 h-full w-full will-change-transform [contain:layout_paint]" preserveAspectRatio="none" viewBox={`0 0 ${100 * safeTiles} 40`} aria-hidden="true">
      <defs>
        <filter id={`wave-glow-${row}`} x="-20%" y="-80%" width="140%" height="260%">
          <feGaussianBlur stdDeviation="2.8" result="coloredBlur" />
          <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g style={{ transform: "translate3d(var(--wave-shift, 0px), 0, 0)", opacity: "var(--wave-pulse, .88)" }} className="transition-opacity duration-200">
        {tileData.map((tile, index) => (
          <g key={tile.pathKey} transform={`translate(${index * 100} 0)`} filter={`url(#wave-glow-${row})`}>
            <polyline points={tile.upperPoints} fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" opacity=".98" />
            <polyline points={tile.lowerPoints} fill="none" stroke={color} strokeWidth="1.15" strokeLinecap="round" opacity=".62" />
          </g>
        ))}
        {tileData.map((tile, index) => (
          <g key={`${tile.pathKey}-loop`} transform={`translate(${index * 100 + safeTiles * 100} 0)`} filter={`url(#wave-glow-${row})`}>
            <polyline points={tile.upperPoints} fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" opacity=".98" />
            <polyline points={tile.lowerPoints} fill="none" stroke={color} strokeWidth="1.15" strokeLinecap="round" opacity=".62" />
          </g>
        ))}
      </g>
      <rect x="0" y="0" width="100%" height="40" fill="url(#none)" opacity="0" />
    </svg>
  );
}

export default memo(StudioWaveform);
