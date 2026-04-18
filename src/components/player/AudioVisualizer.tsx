"use client";

import { useEffect, useRef } from "react";

interface AudioVisualizerProps {
  isPlaying: boolean;
  className?: string;
}

export function AudioVisualizer({ isPlaying, className = "" }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const barsRef = useRef<number[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const BAR_COUNT = 32;
    if (barsRef.current.length === 0) {
      barsRef.current = Array.from({ length: BAR_COUNT }, () => Math.random() * 0.3 + 0.05);
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width;
      const h = canvas.height;
      const barW = (w / BAR_COUNT) * 0.7;
      const gap = (w / BAR_COUNT) * 0.3;

      barsRef.current = barsRef.current.map((v) => {
        if (!isPlaying) return v * 0.95 + 0.02;
        const target = Math.random() * 0.8 + 0.1;
        return v + (target - v) * 0.15;
      });

      barsRef.current.forEach((val, i) => {
        const x = i * (barW + gap);
        const barH = val * h;
        const y = h - barH;

        const gradient = ctx.createLinearGradient(x, y, x, h);
        gradient.addColorStop(0, "rgba(168, 85, 247, 0.9)");
        gradient.addColorStop(0.5, "rgba(99, 102, 241, 0.7)");
        gradient.addColorStop(1, "rgba(59, 130, 246, 0.5)");

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, 2);
        ctx.fill();

        // Glow
        ctx.shadowBlur = 8;
        ctx.shadowColor = "rgba(168, 85, 247, 0.5)";
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animationRef.current);
  }, [isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={40}
      className={className}
      aria-hidden="true"
    />
  );
}
