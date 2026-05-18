"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import { downsamplePeaks, normalizePeakArray, waveformCacheKey } from "../audio";

const lodCache = new Map<string, number[][]>();
const MAX_CACHE_ENTRIES = 120;

function buildSkeletonPeaks(length: number) {
  return Array.from({ length }, (_, index) => {
    const wave = Math.sin(index * 0.45) * 0.22 + Math.sin(index * 0.11) * 0.14;
    return Math.max(0.08, Math.min(0.85, 0.42 + wave));
  });
}

function rememberLod(key: string, value: number[][]) {
  lodCache.set(key, value);

  const oldestKey = lodCache.keys().next().value;
  if (lodCache.size > MAX_CACHE_ENTRIES && typeof oldestKey === "string") {
    lodCache.delete(oldestKey);
  }

  return value;
}

export const Wave = memo(function Wave({
  peaks,
  stereoPeaks,
  color,
  gain,
  zoom = 1,
  loading = false,
  clipId = "wave",
  duration = 0,
  size = 0,
  viewportStart = 0,
  viewportEnd = 1,
}: {
  peaks: number[];
  stereoPeaks?: number[][];
  color: string;
  gain: number;
  zoom?: number;
  loading?: boolean;
  clipId?: string;
  duration?: number;
  size?: number;
  viewportStart?: number;
  viewportEnd?: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const frame = useRef<number | null>(null);
  const offscreen = useRef<OffscreenCanvas | HTMLCanvasElement | null>(null);

  const peakData = useMemo(() => {
    const target = Math.max(80, Math.min(2400, Math.round(zoom * 18)));
    const key = waveformCacheKey({ id: clipId, duration, size, peaks }, zoom) + `:${viewportStart}:${viewportEnd}:${loading}`;
    const cached = lodCache.get(key);
    if (cached) return cached;

    if (loading || (!peaks.length && !stereoPeaks?.length)) return rememberLod(key, [buildSkeletonPeaks(target)]);

    const source = stereoPeaks?.length ? stereoPeaks : [peaks];
    const start = Math.max(0, Math.min(1, viewportStart));
    const end = Math.max(start + 0.001, Math.min(1, viewportEnd));
    const sliced = source.map((channel) => channel.slice(Math.floor(channel.length * start), Math.ceil(channel.length * end)));
    return rememberLod(key, sliced.map((channel) => downsamplePeaks(normalizePeakArray(channel), target)));
  }, [clipId, duration, loading, peaks, size, stereoPeaks, viewportEnd, viewportStart, zoom]);

  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    const draw = () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const rect = parent.getBoundingClientRect();
        const ratio = window.devicePixelRatio || 1;
        const width = Math.max(1, Math.floor(rect.width));
        const height = 38;
        canvas.width = Math.floor(width * ratio);
        canvas.height = Math.floor(height * ratio);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        const supportsOffscreen = typeof OffscreenCanvas !== "undefined";
        if (!offscreen.current) offscreen.current = supportsOffscreen ? new OffscreenCanvas(canvas.width, canvas.height) : document.createElement("canvas");
        offscreen.current.width = canvas.width;
        offscreen.current.height = canvas.height;

        const offscreenCtx = offscreen.current.getContext("2d");
        const ctx = canvas.getContext("2d");
        if (!offscreenCtx || !ctx) return;

        offscreenCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
        offscreenCtx.clearRect(0, 0, width, height);
        offscreenCtx.fillStyle = color;
        offscreenCtx.globalAlpha = loading ? 0.32 : 0.92;

        const visible = Math.max(1, width);
        const channelCount = Math.max(1, Math.min(2, peakData.length));
        const gainScale = Math.pow(10, gain / 20);
        const laneHeight = height / channelCount;

        peakData.slice(0, channelCount).forEach((channel, channelIndex) => {
          const center = laneHeight * channelIndex + laneHeight / 2;
          const step = channel.length / visible;
          for (let x = 0; x < visible; x += 1) {
            const peak = Math.min(1, (channel[Math.min(channel.length - 1, Math.floor(x * step))] ?? 0) * gainScale);
            const barHeight = Math.max(1, peak * (laneHeight - 2));
            offscreenCtx.fillRect(x, center - barHeight / 2, 1, barHeight);
          }
        });

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(offscreen.current, 0, 0);
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
