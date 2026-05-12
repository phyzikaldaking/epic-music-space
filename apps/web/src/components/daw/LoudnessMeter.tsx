"use client";

import React, { useEffect, useRef, useState } from "react";

interface LoudnessMeterProps {
  /** Reference level in LUFS for the chosen platform. */
  targetLufs: number;
  /** Current integrated loudness in LUFS. */
  currentLufs: number | null;
  /** Current True Peak in dBFS. */
  truePeak: number | null;
  /** Short-term loudness (last 3 sec). */
  shortTermLufs: number | null;
  className?: string;
}

const LUFS_PLATFORMS = {
  spotify: -14,
  youtube: -14,
  "apple-music": -16,
  "bbc-iplayer": -23,
  cinema: -24,
} as const;

export default function LoudnessMeter({
  targetLufs,
  currentLufs,
  truePeak,
  shortTermLufs,
  className = "",
}: LoudnessMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Background
    ctx.fillStyle = "rgba(10, 10, 10, 1)";
    ctx.fillRect(0, 0, w, h);

    // Scale: -60 to 0 LUFS (left to right)
    const minLufs = -60;
    const maxLufs = 0;
    const meterHeight = h - 40;

    // Draw grid + labels
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.font = "10px monospace";
    for (let lufs = minLufs; lufs <= maxLufs; lufs += 6) {
      const x = ((lufs - minLufs) / (maxLufs - minLufs)) * w;
      ctx.beginPath();
      ctx.moveTo(x, 20);
      ctx.lineTo(x, 20 + meterHeight);
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.fillText(`${lufs}`, x, h - 5);
    }

    // Target reference line (red)
    if (targetLufs >= minLufs && targetLufs <= maxLufs) {
      const tx = ((targetLufs - minLufs) / (maxLufs - minLufs)) * w;
      ctx.strokeStyle = "rgba(239, 68, 68, 0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tx, 20);
      ctx.lineTo(tx, 20 + meterHeight);
      ctx.stroke();
    }

    // Current level (cyan bar)
    if (currentLufs !== null && currentLufs >= minLufs && currentLufs <= maxLufs) {
      const x = ((currentLufs - minLufs) / (maxLufs - minLufs)) * w;
      ctx.fillStyle = "rgba(34, 211, 238, 0.8)";
      ctx.fillRect(0, 20, x, meterHeight);
    }

    // True Peak warning zone (>= -1 dBFS)
    if (truePeak !== null && truePeak > -1) {
      ctx.fillStyle = "rgba(239, 68, 68, 0.3)";
      ctx.fillRect(0, 20, w, meterHeight);
    }
  }, [targetLufs, currentLufs, truePeak, shortTermLufs]);

  return (
    <div className={`flex flex-col gap-2 rounded-lg bg-black/50 p-3 ${className}`}>
      <div className="text-xs font-bold uppercase text-white/60">Loudness Meter</div>
      <canvas
        ref={canvasRef}
        width={280}
        height={100}
        className="border border-white/10 rounded"
      />
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded bg-black/40 p-2">
          <div className="text-white/50">Integrated</div>
          <div className="font-mono font-bold text-cyan-300">
            {currentLufs !== null ? currentLufs.toFixed(1) : "--"} LUFS
          </div>
        </div>
        <div className="rounded bg-black/40 p-2">
          <div className="text-white/50">Short-term</div>
          <div className="font-mono font-bold text-cyan-300">
            {shortTermLufs !== null ? shortTermLufs.toFixed(1) : "--"} LUFS
          </div>
        </div>
        <div className="rounded bg-black/40 p-2">
          <div className="text-white/50">True Peak</div>
          <div className={`font-mono font-bold ${truePeak !== null && truePeak > -1 ? "text-red-300" : "text-cyan-300"}`}>
            {truePeak !== null ? truePeak.toFixed(1) : "--"} dBFS
          </div>
        </div>
      </div>
      <div className="flex gap-2 text-[10px] text-white/40">
        <select className="rounded border border-white/15 bg-black/50 px-2 py-1 text-white/70">
          <option value="spotify">Spotify (-14)</option>
          <option value="youtube">YouTube (-14)</option>
          <option value="apple-music">Apple Music (-16)</option>
          <option value="bbc-iplayer">BBC iPlayer (-23)</option>
          <option value="cinema">Cinema (-24)</option>
        </select>
      </div>
    </div>
  );
}
