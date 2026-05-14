"use client";

import { memo, useEffect, useRef } from "react";
import type { StudioTrack } from "./studioWorkstationTypes";

type Props = {
  tracks: StudioTrack[];
  steps?: number;
  activeStep?: number;
  selectedTrack: string;
  onSelectTrack: (trackId: string) => void;
  onToggleStep?: (trackId: string, step: number) => void;
};

function CanvasSequencerGrid({ tracks, steps = 16, activeStep = 0, selectedTrack, onSelectTrack, onToggleStep }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ width: 1, height: 1, dpr: 1 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const draw = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(320, rect.width);
      const rowHeight = 42;
      const height = Math.max(180, tracks.length * rowHeight);
      sizeRef.current = { width, height, dpr };
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "rgba(0,0,0,.38)";
      ctx.fillRect(0, 0, width, height);
      const labelWidth = 132;
      const cellWidth = Math.max(22, (width - labelWidth) / steps);
      tracks.forEach((track, row) => {
        const y = row * rowHeight;
        const selected = selectedTrack === track.id;
        ctx.fillStyle = selected ? "rgba(34,211,238,.12)" : row % 2 ? "rgba(255,255,255,.035)" : "rgba(255,255,255,.02)";
        ctx.fillRect(0, y, width, rowHeight - 1);
        ctx.fillStyle = track.color;
        ctx.font = "700 10px system-ui, sans-serif";
        ctx.fillText(track.name.toUpperCase(), 12, y + 25);
        for (let step = 0; step < steps; step += 1) {
          const x = labelWidth + step * cellWidth;
          ctx.strokeStyle = step % 4 === 0 ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.08)";
          ctx.strokeRect(x + 3, y + 8, cellWidth - 6, 24);
          if ((row + step) % 5 === 0 || (track.kind === "drum" && step % 4 === 0)) {
            ctx.fillStyle = track.color;
            ctx.globalAlpha = step === activeStep ? 0.95 : 0.38;
            ctx.fillRect(x + 6, y + 11, cellWidth - 12, 18);
            ctx.globalAlpha = 1;
          }
        }
        if (activeStep >= 0 && activeStep < steps) {
          const x = labelWidth + activeStep * cellWidth;
          ctx.fillStyle = "rgba(255,255,255,.16)";
          ctx.fillRect(x, y, cellWidth, rowHeight - 1);
        }
      });
    };

    draw();
    const resize = new ResizeObserver(draw);
    resize.observe(parent);
    return () => resize.disconnect();
  }, [tracks, steps, activeStep, selectedTrack]);

  return (
    <div className="min-h-[240px] overflow-auto rounded-xl border border-white/10 bg-black/50">
      <canvas
        ref={canvasRef}
        role="grid"
        aria-label="Beat sequencer grid"
        onClick={(event) => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const y = event.clientY - rect.top;
          const rowHeight = 42;
          const labelWidth = 132;
          const row = Math.floor(y / rowHeight);
          const track = tracks[row];
          if (!track) return;
          onSelectTrack(track.id);
          if (x > labelWidth && onToggleStep) {
            const cellWidth = Math.max(22, (rect.width - labelWidth) / steps);
            const step = Math.max(0, Math.min(steps - 1, Math.floor((x - labelWidth) / cellWidth)));
            onToggleStep(track.id, step);
          }
        }}
      />
    </div>
  );
}

export default memo(CanvasSequencerGrid);
