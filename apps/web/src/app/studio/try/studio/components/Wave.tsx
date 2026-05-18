"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import { downsamplePeaks, normalizePeakArray } from "../audio";

function buildSkeletonPeaks(length: number) {
  return Array.from({ length }, (_, index) => {
    const wave = Math.sin(index * 0.45) * 0.22 + Math.sin(index * 0.11) * 0.14;
    return Math.max(0.08, Math.min(0.85, 0.42 + wave));
  });
}

export const Wave = memo(function Wave({
  peaks,
  stereoPeaks,
  color,
  gain,
  zoom = 1,
  loading = false,
}: {
  peaks: number[];
  stereoPeaks?: number[][];
  color: string;
  gain: number;
  zoom?: number;
  loading?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const frame = useRef<number | null>(null);

  const peakData = useMemo(() => {
    const target = Math.max(80, Math.min(2400, Math.round(zoom * 18)));
    if (loading || (!peaks.length && !stereoPeaks?.length)) return [buildSkeletonPeaks(target)];
    const source = stereoPeaks?.length ? stereoPeaks : [peaks];
    return source.map((channel) => downsamplePeaks(normalizePeakArray(channel), target));
  }, [loading, peaks, stereoPeaks, zoom]);

  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    const draw = () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const rect = parent.getBoundingClientRect();
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.floor(rect.width * ratio));
        canvas.height = Math.floor(38 * ratio);
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = "38px";

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, rect.width, 38);
        ctx.fillStyle = color;
        ctx.globalAlpha = loading ? 0.32 : 0.92;

        const visible = Math.max(1, Math.floor(rect.width));
        const channelCount = Math.max(1, Math.min(2, peakData.length));
        const gainScale = Math.pow(10, gain / 20);
        const laneHeight = 38 / channelCount;

        peakData.slice(0, channelCount).forEach((channel, channelIndex) => {
          const center = laneHeight * channelIndex + laneHeight / 2;
          const step = channel.length / visible;
          for (let x = 0; x < visible; x += 1) {
            const peak = Math.min(1, (channel[Math.min(channel.length - 1, Math.floor(x * step))] ?? 0) * gainScale);
            const height = Math.max(1, peak * (laneHeight - 2));
            ctx.fillRect(x, center - height / 2, 1, height);
          }
        });
      });
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(parent);
    return () => {
      observer.disconnect();
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [color, gain, loading, peakData]);

  return (
    <canvas
      ref={ref}
      className="mt-1 block w-full bg-black/20"
      aria-busy={loading}
      aria-label={loading ? "Loading audio waveform" : "Decoded audio waveform"}
    />
  );
});
