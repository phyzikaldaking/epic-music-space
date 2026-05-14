"use client";

import { memo, useMemo } from "react";

function buildWavePoints(row: number, invert = false) {
  return Array.from({ length: 70 }, (_, i) => {
    const y = 20 + (invert ? -1 : 1) * (Math.sin(i * (0.7 + row * 0.08)) * (5 + (i % 9)) + Math.cos(i * 0.31) * 4);
    return `${i * 1.45},${y}`;
  }).join(" ");
}

function StudioWaveform({ color, row }: { color: string; row: number }) {
  const upperPoints = useMemo(() => buildWavePoints(row), [row]);
  const lowerPoints = useMemo(() => buildWavePoints(row, true), [row]);

  return (
    <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 40" aria-hidden="true">
      <polyline points={upperPoints} fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" opacity=".95" />
      <polyline points={lowerPoints} fill="none" stroke={color} strokeWidth="1.1" strokeLinecap="round" opacity=".55" />
    </svg>
  );
}

export default memo(StudioWaveform);
