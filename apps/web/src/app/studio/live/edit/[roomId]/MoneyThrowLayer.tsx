"use client";

import { useEffect, useState, type MutableRefObject } from "react";

// "Money thrown on stage" — animates a paper bill arcing from the
// tipper's seat (audience grid) to the recipient's seat (stage card).
// When the tip targets the whole stage (recipientId is null), the
// bill arcs to the center of the stage instead.
//
// Bills scale with amount: $1 = tiny single, $50+ = stack of bills.
// We intentionally use real-world dollar imagery (emoji 💵) so it
// reads correctly on every device without an asset pipeline. The
// animation runs purely via CSS keyframes + computed offsets.

export type MoneyThrow = {
  id: string;
  fromUserId: string;
  toUserId: string | null;
  amountUsd: number;
};

type Bill = MoneyThrow & {
  // Resolved at start time. Null if we couldn't find one of the seats
  // (the bill is dropped — better than animating from 0,0 to 0,0).
  start: { x: number; y: number } | null;
  end: { x: number; y: number } | null;
};

export default function MoneyThrowLayer({
  throws,
  seatRefs,
}: {
  throws: MoneyThrow[];
  seatRefs: MutableRefObject<Map<string, HTMLDivElement | null>>;
}) {
  const [bills, setBills] = useState<Bill[]>([]);

  // Resolve seat → screen positions when a new throw arrives. We
  // capture coords at start time so the bill doesn't snap if a
  // user's avatar reflows mid-flight.
  useEffect(() => {
    const known = new Set(bills.map((b) => b.id));
    const additions: Bill[] = [];
    for (const t of throws) {
      if (known.has(t.id)) continue;
      const fromEl = seatRefs.current.get(t.fromUserId);
      const toEl = t.toUserId
        ? seatRefs.current.get(t.toUserId)
        : firstStageEl(seatRefs.current);
      const start = rectCenter(fromEl?.getBoundingClientRect());
      const end = rectCenter(toEl?.getBoundingClientRect());
      additions.push({ ...t, start, end });
    }
    if (additions.length > 0) {
      setBills((prev) => [...prev, ...additions]);
    }
    // Drop bills that aren't in the upstream list anymore (already
    // unmounted by the parent timeout).
    setBills((prev) => prev.filter((b) => throws.some((t) => t.id === b.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [throws]);

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {bills.map((b) =>
        b.start && b.end ? <FlyingBill key={b.id} bill={b} /> : null,
      )}
    </div>
  );
}

function FlyingBill({ bill }: { bill: Bill }) {
  const start = bill.start!;
  const end = bill.end!;
  // Cubic Bezier control point above the midpoint for a nice
  // money-toss arc. Higher amounts arc higher.
  const midX = (start.x + end.x) / 2;
  const arcHeight = Math.min(180, 60 + bill.amountUsd * 1.5);
  const midY = Math.min(start.y, end.y) - arcHeight;

  // Stack a few bills for bigger tips so $50 visibly reads bigger
  // than $1 without resizing the emoji past readability.
  const stack = Math.min(5, Math.max(1, Math.round(bill.amountUsd / 10)));

  return (
    <svg
      className="absolute inset-0 h-full w-full"
      style={{ overflow: "visible" }}
    >
      <defs>
        <path
          id={`path-${bill.id}`}
          d={`M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`}
          fill="none"
        />
      </defs>
      {Array.from({ length: stack }).map((_, i) => (
        <g key={i}>
          <text fontSize={28 + bill.amountUsd / 4} textAnchor="middle">
            <animateMotion
              dur={`${1.4 + i * 0.05}s`}
              fill="freeze"
              rotate="auto"
              begin={`${i * 0.06}s`}
            >
              <mpath href={`#path-${bill.id}`} />
            </animateMotion>
            💵
          </text>
        </g>
      ))}
      {/* Landing flash on the recipient seat */}
      <g transform={`translate(${end.x}, ${end.y})`}>
        <circle
          r="14"
          fill="rgba(16, 185, 129, 0.55)"
          style={{
            animation: `ems-tipFlash 0.8s ease-out ${1.3}s forwards`,
            opacity: 0,
            transformBox: "fill-box",
            transformOrigin: "center",
          }}
        />
      </g>
      {/* $ amount label that pops near the recipient */}
      <text
        x={end.x}
        y={end.y - 24}
        textAnchor="middle"
        fontSize="14"
        fontWeight="900"
        fill="#10b981"
        style={{
          opacity: 0,
          animation: `ems-tipLabel 1.6s ease-out ${1.2}s forwards`,
        }}
      >
        +${bill.amountUsd}
      </text>
    </svg>
  );
}

function rectCenter(r: DOMRect | undefined): { x: number; y: number } | null {
  if (!r) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// Pick any stage seat as the destination when the tip is for "the
// whole stage". We don't have a way to identify stage-vs-audience
// from the ref map alone, so the parent component is expected to
// register stage seat refs first; we walk the map and pick the first
// element with the amber "On stage" border styling marker.
function firstStageEl(map: Map<string, HTMLDivElement | null>): HTMLDivElement | null {
  for (const el of map.values()) {
    if (el && el.className.includes("border-amber-400")) return el;
  }
  return null;
}
