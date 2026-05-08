"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  /** Numeric value, in [min, max]. */
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Label printed under the knob — e.g. "REV SHARE %". */
  label?: string;
  /** Show a numeric readout under the knob. Default true. */
  showReadout?: boolean;
  /** Format the readout text (e.g. value => `${value}%`). */
  format?: (v: number) => string;
  size?: "sm" | "md";
  className?: string;
  /** Tube-glow color of the indicator dot. */
  tone?: "amber" | "cyan" | "rec";
};

/**
 * A knurled aluminum knob with an indicator notch. Drag vertically (or
 * use arrow keys when focused) to change the value. The "swept" sector
 * lights up around the rim so you can see the knob's current position
 * at a glance — a real piece of hardware does this with a small LED arc.
 *
 * Behavior matches the convention on classic console controls:
 *  - drag UP increases value, drag DOWN decreases (consistent with hand
 *    movement on a real knob).
 *  - shift-drag = fine (10× slower).
 *  - 0..1 of the knob's full sweep maps to (min..max).
 */
export default function Knob({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  showReadout = true,
  format,
  size = "md",
  className = "",
  tone = "amber",
}: Props) {
  const range = max - min;
  const ratio = range > 0 ? Math.max(0, Math.min(1, (value - min) / range)) : 0;
  // Rotation: knob sweeps from -135° (full counter-clockwise / minimum)
  // to +135° (full clockwise / maximum). 270° of total travel — same as
  // most studio gear. 0° points the indicator straight up at midpoint.
  const angle = -135 + ratio * 270;

  const dragRef = useRef<{ startY: number; startVal: number; shift: boolean } | null>(
    null,
  );
  const [dragging, setDragging] = useState(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = { startY: e.clientY, startVal: value, shift: e.shiftKey };
      setDragging(true);
    },
    [value],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      // 200px of drag = full sweep (range). Shift = 10× slower.
      const sensitivity = drag.shift ? 2000 : 200;
      const dy = drag.startY - e.clientY;
      const delta = (dy / sensitivity) * range;
      let next = drag.startVal + delta;
      if (step > 0) next = Math.round(next / step) * step;
      next = Math.max(min, Math.min(max, next));
      if (next !== value) onChange(next);
    },
    [min, max, range, step, value, onChange],
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

  // Keyboard accessibility — focusable + arrow keys. Hardware emulation
  // shouldn't lose the basic input contract.
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrapRef.current;
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
      const mult = e.shiftKey ? 1 : 5; // shift = fine, default = coarse
      const delta = dir * step * mult;
      onChange(Math.max(min, Math.min(max, value + delta)));
    }
    el.addEventListener("keydown", handle);
    return () => el.removeEventListener("keydown", handle);
  }, [value, onChange, min, max, step]);

  const W = size === "sm" ? 56 : 72;

  return (
    <div className={`flex flex-col items-center gap-1.5 ${className}`}>
      <div
        ref={wrapRef}
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`relative cursor-ns-resize select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-tube-400/50 ${
          dragging ? "scale-[1.04]" : ""
        } transition-transform`}
        style={{ width: W, height: W }}
      >
        {/* Sector that lights up showing the swept position. */}
        <svg
          width={W}
          height={W}
          viewBox={`0 0 ${W} ${W}`}
          className="absolute inset-0"
          aria-hidden
        >
          <defs>
            <linearGradient id={`knob-rim-${tone}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.85)" />
            </linearGradient>
          </defs>
          {/* Outer rim. */}
          <circle
            cx={W / 2}
            cy={W / 2}
            r={W / 2 - 1}
            fill="none"
            stroke="rgba(0,0,0,0.7)"
            strokeWidth="1"
          />
          {/* Active arc — uses stroke-dasharray to show only the swept
              portion (counter-clockwise from -135° to current angle). */}
          {(() => {
            // Total path length (radius -> circumference of full circle, but
            // we sweep at most 270° = 0.75 of the circle).
            const r = W / 2 - 4;
            const sweep = (ratio * 270 * Math.PI) / 180;
            const arcLen = sweep * r;
            const totalLen = 2 * Math.PI * r;
            // Rotate the SVG so the arc starts at -135° (= 7:30 position).
            return (
              <circle
                cx={W / 2}
                cy={W / 2}
                r={r}
                fill="none"
                stroke={
                  tone === "cyan"
                    ? "#33f8ff"
                    : tone === "rec"
                    ? "#ff5a4a"
                    : "#ffb04a"
                }
                strokeOpacity="0.85"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={`${arcLen} ${totalLen}`}
                transform={`rotate(135 ${W / 2} ${W / 2})`}
                style={{
                  filter:
                    tone === "cyan"
                      ? "drop-shadow(0 0 4px rgba(0,245,255,0.55))"
                      : tone === "rec"
                      ? "drop-shadow(0 0 4px rgba(232,38,28,0.55))"
                      : "drop-shadow(0 0 4px rgba(255,138,30,0.55))",
                }}
              />
            );
          })()}
        </svg>

        {/* Knurled cap. radial gradient + small angled facets sell the
            milled aluminum look. The indicator notch sits on top, rotated
            to the current angle. */}
        <div
          className="absolute inset-1.5 rounded-full shadow-knob"
          style={{
            background:
              "radial-gradient(circle at 35% 30%, #c8c9cf 0%, #6e6f74 35%, #2c2d31 75%, #18191c 100%)",
          }}
        />
        {/* Knurl ridges — repeating radial lines on top of the cap. */}
        <div
          aria-hidden
          className="absolute inset-1.5 rounded-full opacity-60"
          style={{
            background:
              "repeating-conic-gradient(from 0deg, rgba(255,255,255,0.06) 0deg 4deg, rgba(0,0,0,0.25) 4deg 8deg)",
            mixBlendMode: "overlay",
          }}
        />
        {/* Indicator notch — points to current value. */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ transform: `rotate(${angle}deg)` }}
        >
          <span
            className="absolute left-1/2 -translate-x-1/2"
            style={{
              top: 4,
              width: 3,
              height: size === "sm" ? 12 : 16,
              borderRadius: 1,
              background:
                tone === "cyan"
                  ? "linear-gradient(to bottom, #f0ffff, #33f8ff)"
                  : tone === "rec"
                  ? "linear-gradient(to bottom, #fff, #ff5a4a)"
                  : "linear-gradient(to bottom, #fff5d8, #ffb04a)",
              boxShadow:
                tone === "cyan"
                  ? "0 0 5px rgba(0,245,255,0.7)"
                  : tone === "rec"
                  ? "0 0 5px rgba(232,38,28,0.7)"
                  : "0 0 5px rgba(255,138,30,0.7)",
            }}
          />
        </div>
      </div>

      {showReadout && (
        <span className="text-readout-amber text-[11px] tabular-nums">
          {format ? format(value) : value}
        </span>
      )}
      {label && <span className="studio-label text-white/55">{label}</span>}
    </div>
  );
}
