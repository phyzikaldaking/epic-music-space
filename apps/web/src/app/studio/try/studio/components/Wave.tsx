"use client";

import { useEffect, useRef } from "react";

export function Wave({
  peaks,
  color,
  gain,
}: {
  peaks: number[];
  color: string;
  gain: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    const draw = () => {
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

      const visible = Math.max(1, Math.floor(rect.width));
      const step = peaks.length / visible;
      const center = 19;
      const gainScale = Math.pow(10, gain / 20);

      for (let x = 0; x < visible; x += 1) {
        const peak = Math.min(
          1,
          (peaks[Math.min(peaks.length - 1, Math.floor(x * step))] ?? 0) * gainScale,
        );
        const height = Math.max(1, peak * 36);
        ctx.globalAlpha = 0.92;
        ctx.fillRect(x, center - height / 2, 1, height);
      }
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [peaks, color, gain]);

  return (
    <canvas
      ref={ref}
      className="mt-1 block w-full bg-black/20"
      aria-label="Decoded audio waveform"
    />
  );
}
