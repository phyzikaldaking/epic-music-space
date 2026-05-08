"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Stenciled label printed above/below the fader cap. */
  label?: string;
  /** Format the readout text. */
  format?: (v: number) => string;
  /** Track travel in px — controls how tall the fader renders. */
  height?: number;
  className?: string;
};

/**
 * Console channel-strip fader. Vertical track, knurled cap, scale tick
 * marks on either side. Drag the cap to change the value, or use arrow
 * keys when focused. The travel maps linearly to (min..max).
 */
export default function Fader({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  format,
  height = 160,
  className = "",
}: Props) {
  const range = max - min;
  const ratio = range > 0 ? Math.max(0, Math.min(1, (value - min) / range)) : 0;

  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ trackTop: number; trackHeight: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const setFromY = useCallback(
    (clientY: number) => {
      const drag = dragRef.current;
      if (!drag) return;
      const localY = clientY - drag.trackTop;
      // Top of track = max, bottom = min.
      const r = 1 - Math.max(0, Math.min(1, localY / drag.trackHeight));
      let next = min + r * range;
      if (step > 0) next = Math.round(next / step) * step;
      next = Math.max(min, Math.min(max, next));
      if (next !== value) onChange(next);
    },
    [min, max, range, step, value, onChange],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      dragRef.current = { trackTop: rect.top, trackHeight: rect.height };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setDragging(true);
      setFromY(e.clientY);
    },
    [setFromY],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      setFromY(e.clientY);
    },
    [setFromY],
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

  useEffect(() => {
    const el = trackRef.current?.parentElement;
    if (!el) return;
    function handle(e: KeyboardEvent) {
      const dir =
        e.key === "ArrowUp" || e.key === "ArrowRight"
          ? 1
          : e.key === "ArrowDown" || e.key === "ArrowLeft"
          ? -1
          : 0;
      if (!dir) return;
      e.preventDefault();
      const mult = e.shiftKey ? 1 : 5;
      onChange(Math.max(min, Math.min(max, value + dir * step * mult)));
    }
    el.addEventListener("keydown", handle);
    return () => el.removeEventListener("keydown", handle);
  }, [value, onChange, min, max, step]);

  return (
    <div className={`flex flex-col items-center gap-1.5 ${className}`}>
      {label && <span className="studio-label text-white/55">{label}</span>}
      <div
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        tabIndex={0}
        className="relative flex flex-col items-center outline-none focus-visible:ring-2 focus-visible:ring-tube-400/45 rounded-md"
        style={{ height: height + 24 }}
      >
        {/* Track. Recessed. */}
        <div
          ref={trackRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="relative w-1.5 cursor-pointer rounded-full"
          style={{
            height,
            background:
              "linear-gradient(90deg, rgba(0,0,0,0.85), rgba(0,0,0,0.55), rgba(0,0,0,0.85))",
            boxShadow:
              "inset 0 1px 2px rgba(0,0,0,0.9), 0 1px 0 rgba(255,255,255,0.04)",
          }}
        >
          {/* Tick marks — short horizontal hashes at 10% intervals. */}
          {Array.from({ length: 11 }, (_, i) => i / 10).map((t) => (
            <span
              key={t}
              aria-hidden
              className="absolute -translate-y-1/2"
              style={{
                left: -8,
                top: `${(1 - t) * 100}%`,
                width: 6,
                height: 1,
                background: "rgba(255,255,255,0.18)",
              }}
            />
          ))}
          {Array.from({ length: 11 }, (_, i) => i / 10).map((t) => (
            <span
              key={`r-${t}`}
              aria-hidden
              className="absolute -translate-y-1/2"
              style={{
                right: -8,
                top: `${(1 - t) * 100}%`,
                width: 6,
                height: 1,
                background: "rgba(255,255,255,0.18)",
              }}
            />
          ))}

          {/* Cap — knurled, with the white indicator stripe across its face. */}
          <div
            aria-hidden
            className={`absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-sm ${
              dragging ? "scale-105" : ""
            } transition-transform`}
            style={{
              top: `${(1 - ratio) * 100}%`,
              width: 32,
              height: 22,
              background:
                "linear-gradient(180deg, #2e2f33 0%, #1a1b1f 50%, #08090b 100%)",
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -2px 4px rgba(0,0,0,0.7), 0 2px 6px rgba(0,0,0,0.6)",
            }}
          >
            {/* Indicator stripe across the middle. */}
            <span
              className="absolute left-1 right-1 top-1/2 -translate-y-1/2 rounded-full"
              style={{
                height: 2,
                background:
                  "linear-gradient(90deg, rgba(255,255,255,0.85), rgba(255,255,255,0.4))",
              }}
            />
          </div>
        </div>
      </div>
      <span className="text-readout-amber text-[11px] tabular-nums">
        {format ? format(value) : value}
      </span>
    </div>
  );
}
