"use client";

import { memo, useEffect, useMemo, useRef } from "react";

type WaveformTile = {
  upperPoints: string;
  lowerPoints: string;
  pathKey: string;
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

function StudioWaveform({ color, row, tiles = 1 }: { color: string; row: number; tiles?: number }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const safeTiles = Math.max(1, Math.min(8, tiles));
  const tileData = useMemo(() => Array.from({ length: safeTiles }, (_, tile) => getWaveformTile(row, tile)), [row, safeTiles]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    if (typeof OffscreenCanvas !== "undefined") {
      svg.dataset.renderer = "offscreen-ready";
    } else {
      svg.dataset.renderer = "svg-cached";
    }
  }, []);

  return (
    <svg ref={svgRef} className="absolute inset-0 h-full w-full will-change-transform [contain:layout_paint]" preserveAspectRatio="none" viewBox={`0 0 ${100 * safeTiles} 40`} aria-hidden="true">
      {tileData.map((tile, index) => (
        <g key={tile.pathKey} transform={`translate(${index * 100} 0)`}>
          <polyline points={tile.upperPoints} fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" opacity=".95" />
          <polyline points={tile.lowerPoints} fill="none" stroke={color} strokeWidth="1.1" strokeLinecap="round" opacity=".55" />
        </g>
      ))}
    </svg>
  );
}

export default memo(StudioWaveform);