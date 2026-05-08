"use client";

type Props = {
  /** 0–1 needle position. Anything above 0.85 trips into the red zone. */
  value: number;
  /** Stenciled label above the meter — "PLAYS", "SALES", "VIEWS". */
  label?: string;
  /** Optional readout displayed in small text under the meter (e.g. "12,408"). */
  readout?: string;
  /** Compact orientation — smaller arc, smaller padding. */
  size?: "sm" | "md";
  className?: string;
};

/**
 * Animated VU meter — needle sweep from 0 to 1, green→yellow→red zones,
 * faint glass cover. SVG-only, no JS animation loop, so it's cheap to
 * scatter across a page. The needle uses CSS transition so updates
 * (e.g. live conversion %) move smoothly.
 */
export default function VUMeter({
  value,
  label,
  readout,
  size = "md",
  className = "",
}: Props) {
  const clamped = Math.max(0, Math.min(1, value));
  // Needle sweeps -55deg (full left, value=0) to +55deg (full right, value=1).
  const angle = -55 + clamped * 110;
  const inRed = clamped > 0.85;

  const W = size === "sm" ? 120 : 180;
  const H = size === "sm" ? 80 : 110;
  const cx = W / 2;
  const cy = H + 10; // pivot below the visible arc
  const radius = size === "sm" ? 70 : 110;

  // Tick marks every 10° between -55 and +55 (12 ticks).
  const ticks = Array.from({ length: 12 }, (_, i) => -55 + i * 10);

  return (
    <div
      className={`relative inline-block rounded-md studio-faceplate-dark p-2 ${className}`}
      data-vu-meter=""
    >
      {label && (
        <p className="studio-label mb-1 text-white/45 px-1">{label}</p>
      )}
      <div className="relative">
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          aria-hidden
          className="block"
        >
          <defs>
            <linearGradient id="vu-face" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f4ead0" />
              <stop offset="100%" stopColor="#d4b06a" />
            </linearGradient>
            <radialGradient id="vu-glass" cx="50%" cy="0%" r="100%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.25)" />
              <stop offset="60%" stopColor="rgba(255,255,255,0)" />
            </radialGradient>
          </defs>

          {/* Cream meter face — the printed scale background. */}
          <rect
            x="2"
            y="2"
            width={W - 4}
            height={H - 4}
            rx="4"
            fill="url(#vu-face)"
          />

          {/* Green / red arc bands. */}
          <path
            d={arcPath(cx, cy, radius, -55, 30)}
            fill="none"
            stroke="rgba(40,80,40,0.55)"
            strokeWidth="3"
          />
          <path
            d={arcPath(cx, cy, radius, 30, 55)}
            fill="none"
            stroke="rgba(180,40,30,0.7)"
            strokeWidth="3"
          />

          {/* Tick marks. */}
          {ticks.map((deg) => {
            const major = deg % 30 === 0;
            const inner = radius - (major ? 12 : 6);
            const outer = radius - 2;
            const rad = (deg * Math.PI) / 180;
            const x1 = cx + Math.sin(rad) * inner;
            const y1 = cy - Math.cos(rad) * inner;
            const x2 = cx + Math.sin(rad) * outer;
            const y2 = cy - Math.cos(rad) * outer;
            return (
              <line
                key={deg}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="rgba(0,0,0,0.7)"
                strokeWidth={major ? 1.4 : 0.8}
              />
            );
          })}

          {/* Needle. CSS transition for smoothness. */}
          <line
            x1={cx}
            y1={cy}
            x2={cx + Math.sin((angle * Math.PI) / 180) * (radius - 8)}
            y2={cy - Math.cos((angle * Math.PI) / 180) * (radius - 8)}
            stroke={inRed ? "#b81a13" : "#1a1a1a"}
            strokeWidth="2.2"
            strokeLinecap="round"
            style={{
              transformOrigin: `${cx}px ${cy}px`,
              transition: "transform 600ms cubic-bezier(0.34,1.56,0.64,1)",
            }}
          />
          {/* Pivot cap. */}
          <circle cx={cx} cy={cy} r="5" fill="#222" />
          <circle cx={cx} cy={cy} r="2" fill="#888" />

          {/* Glass cover highlight. */}
          <rect
            x="2"
            y="2"
            width={W - 4}
            height={H - 4}
            rx="4"
            fill="url(#vu-glass)"
          />
        </svg>

        {/* Red overload LED — lights when value > 0.85. */}
        <span
          aria-hidden
          className={`absolute right-2 top-2 h-2 w-2 rounded-full ${
            inRed ? "led-on-rec" : "led-off"
          }`}
        />
      </div>

      {readout && (
        <p className="mt-1 text-readout-amber text-[11px] text-center tabular-nums">
          {readout}
        </p>
      )}
    </div>
  );
}

/** Build an SVG arc path between two angles (degrees, 0 = up, +x = right). */
function arcPath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
) {
  const start = ((startDeg - 90) * Math.PI) / 180;
  const end = ((endDeg - 90) * Math.PI) / 180;
  const x1 = cx + Math.cos(start) * r;
  const y1 = cy + Math.sin(start) * r;
  const x2 = cx + Math.cos(end) * r;
  const y2 = cy + Math.sin(end) * r;
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}
