"use client";

import { useEffect, useRef, useState } from "react";

interface Cursor {
  id: string;
  name: string;
  hue: number;
  x: number;
  y: number;
}

interface Props {
  /** This surface's identifier — collaborator cursors with the same
   *  cursorSurface get rendered here. Match against
   *  data-collab-surface on the surface root element. */
  surface: "mixer" | "grid";
  /** Live collaborator list from Supabase presence. Filtered + mapped
   *  into screen coordinates inside this component. */
  collaborators: Array<{
    id: string;
    name: string;
    hue?: number;
    cursorX?: number | null;
    cursorY?: number | null;
    cursorSurface?: "mixer" | "grid" | "other" | null;
  }>;
}

// Overlay that renders other collaborators' cursors on top of a tagged
// surface. The surface itself must be `position: relative` and carry the
// matching data-collab-surface attribute (used by the broadcast loop in
// DawWorkspace). Each cursor is a small colored circle with the
// collaborator's initial; smoothly lerps toward the next position so
// 10Hz packets feel continuous.
export default function CollaboratorCursors({ surface, collaborators }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function measure() {
      const parent = (containerRef.current?.parentElement ?? null) as HTMLElement | null;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      setSize({ w: rect.width, h: rect.height });
    }
    measure();
    const ro = new ResizeObserver(measure);
    const parent = el.parentElement;
    if (parent) ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  const cursors: Cursor[] = collaborators
    .filter(
      (c) =>
        c.cursorSurface === surface &&
        typeof c.cursorX === "number" &&
        typeof c.cursorY === "number",
    )
    .map((c) => ({
      id: c.id,
      name: c.name,
      hue: c.hue ?? 200,
      x: (c.cursorX ?? 0) * size.w,
      y: (c.cursorY ?? 0) * size.h,
    }));

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
    >
      {cursors.map((c) => (
        <RemoteCursor key={c.id} cursor={c} />
      ))}
    </div>
  );
}

// One remote cursor. The position comes in at ~10Hz from Supabase
// presence; CSS transition on `transform` smooths the gaps without
// needing a per-frame JS lerp. Honors prefers-reduced-motion by
// disabling the transition for users who opt out of animation.
function RemoteCursor({ cursor }: { cursor: Cursor }) {
  const reducedMotion = useReducedMotion();
  const color = `hsl(${cursor.hue}, 85%, 65%)`;
  const initial = cursor.name.trim().charAt(0).toUpperCase() || "•";
  return (
    <div
      // translate3d puts the cursor on the GPU. The CSS transition runs
      // independently of React renders — no rAF loop, no setState per
      // frame. 100ms matches the broadcast cadence so each new position
      // ease-outs into the next one as it arrives.
      style={{
        backgroundColor: color,
        transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)`,
        transition: reducedMotion ? "none" : "transform 100ms ease-out",
      }}
      className="absolute top-0 left-0 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[10px] font-black text-black shadow-[0_0_8px_rgba(0,0,0,0.5)] will-change-transform"
      title={cursor.name}
    >
      {initial}
    </div>
  );
}

// Local hook — listens to the prefers-reduced-motion media query and
// re-renders when it flips. Inlined here rather than promoted to a util
// because no other component in the workspace needs it yet; promote on
// the second caller. SSR returns false (assume motion allowed) until the
// effect runs and reads the real value.
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}
