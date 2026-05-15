/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useLayoutEffect, useState, useRef } from "react";

export interface SpotlightStep {
  target: string;
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
  loopVideoUrl?: string;
}

interface SpotlightTourProps {
  steps: readonly SpotlightStep[];
  open: boolean;
  onClose: () => void;
}

interface Rect { top: number; left: number; width: number; height: number; }

const PADDING = 8;
const CARD_GAP = 12;
const CARD_WIDTH = 320;

export default function SpotlightTour({ steps, open, onClose }: SpotlightTourProps) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [missing, setMissing] = useState(false);
  const targetRef = useRef<HTMLElement | null>(null);

  useEffect(() => { if (open) setIndex(0); }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") setIndex((i) => Math.min(steps.length - 1, i + 1));
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, steps.length]);

  useLayoutEffect(() => {
    if (!open) return;
    const step = steps[index];
    if (!step) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    targetRef.current = el;
    if (!el) { setMissing(true); setRect(null); return; }
    setMissing(false);
    const targetRect = el.getBoundingClientRect();
    const viewportH = window.innerHeight || document.documentElement.clientHeight;
    const viewportW = window.innerWidth || document.documentElement.clientWidth;
    if (!(targetRect.bottom > 0 && targetRect.top < viewportH && targetRect.right > 0 && targetRect.left < viewportW)) {
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }
    const measure = () => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top - PADDING, left: r.left - PADDING, width: r.width + PADDING * 2, height: r.height + PADDING * 2 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [open, index, steps]);

  if (!open) return null;
  const step = steps[index];
  if (!step) return null;
  const card = computeCardPosition(rect);

  return (
    <div role="dialog" aria-modal="false" aria-label={step.title} className="fixed inset-0 z-[183] pointer-events-none">
      <svg aria-hidden width="100%" height="100%" className="absolute inset-0 pointer-events-none">
        <defs>
          <mask id="ems-spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {rect ? <rect x={rect.left} y={rect.top} width={rect.width} height={rect.height} rx="12" fill="black" /> : null}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="rgba(2, 2, 6, 0.45)" mask="url(#ems-spotlight-mask)" />
      </svg>

      {rect ? <div aria-hidden className="pointer-events-none absolute rounded-xl" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height, boxShadow: "0 0 0 2px rgba(255, 184, 77, 0.85), 0 0 32px rgba(255, 184, 77, 0.45)", animation: "tube-pulse 1.6s ease-in-out infinite" }} /> : null}

      <div className="pointer-events-auto absolute rounded-2xl border border-tube-300/35 bg-[#0a0a10]/95 p-4 shadow-2xl shadow-black/50 backdrop-blur-md" style={{ top: card.top, left: card.left, width: CARD_WIDTH }}>
        <p className="text-[10px] font-black uppercase tracking-[0.32em] text-tube-300">Tour · Step {index + 1} of {steps.length}</p>
        <h3 className="mt-1 text-lg font-bold text-white">{step.title}</h3>
        {step.loopVideoUrl ? <video src={step.loopVideoUrl} muted autoPlay loop playsInline preload="metadata" className="mt-3 aspect-video w-full rounded-lg border border-white/10 bg-black/40"><track kind="captions" /></video> : null}
        <p className="mt-2 text-sm leading-relaxed text-white/75">{step.body}</p>
        {missing ? <p className="mt-2 rounded-md border border-amber-400/30 bg-amber-400/5 p-2 text-[11px] text-amber-200">Couldn&apos;t find this control on screen. Skip ahead, or scroll the workspace into view and try again.</p> : null}
        <div className="mt-4 flex items-center gap-2">
          {step.action ? <button type="button" onClick={() => { step.action?.onClick(); onClose(); }} className="rounded-md border border-tube-300/40 bg-tube-300/15 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-tube-100 transition hover:bg-tube-300/25">{step.action.label}</button> : null}
          <button type="button" onClick={onClose} className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white/65 transition hover:bg-white/10">Close</button>
          <span className="flex-1" />
          <button type="button" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))} className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white/65 transition hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed">Back</button>
          {index === steps.length - 1 ? <button type="button" onClick={onClose} className="rounded-md bg-cyan-500 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-black transition hover:bg-cyan-400">Done</button> : <button type="button" onClick={() => setIndex((i) => Math.min(steps.length - 1, i + 1))} className="rounded-md bg-cyan-500 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-black transition hover:bg-cyan-400">Next</button>}
        </div>
      </div>
    </div>
  );
}

function computeCardPosition(rect: Rect | null): { top: number; left: number } {
  if (typeof window === "undefined") return { top: 100, left: 100 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!rect) return { top: vh / 2 - 100, left: Math.max(16, vw / 2 - CARD_WIDTH / 2) };
  let top = rect.top + rect.height + CARD_GAP;
  let left = rect.left + rect.width / 2 - CARD_WIDTH / 2;
  const ESTIMATED_CARD_HEIGHT = 200;
  if (top + ESTIMATED_CARD_HEIGHT > vh - 16) top = rect.top - ESTIMATED_CARD_HEIGHT - CARD_GAP;
  if (left < 16) left = 16;
  if (left + CARD_WIDTH > vw - 16) left = vw - CARD_WIDTH - 16;
  if (top < 16) top = 16;
  return { top, left };
}
