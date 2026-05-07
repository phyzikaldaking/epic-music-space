"use client";

/**
 * Liquid page-transition overlay + whoosh.
 *
 * Why this exists: vanilla App Router navigations have no perceived motion
 * — the page just blanks for 200-600ms and pops in. A simple wipe overlay
 * + a 120ms WebAudio whoosh makes those same navigations feel deliberate
 * and fast (the perceived-speed boost comes from filling the dead silence
 * with motion, not from making the network any faster).
 *
 * How it works:
 * 1. Capture-phase click handler on `document` watches every same-origin
 *    `<a>` click. If the click is a real navigation (left button, no
 *    modifier, target=_self, different pathname) we kick off the
 *    "leaving" animation: a gradient liquid wipe sweeps from the cursor
 *    + a low-pass-filtered whoosh fires for ~140ms.
 * 2. usePathname effect fires on the new page and runs the "entering"
 *    animation: the wipe melts away in reverse with a faint chime.
 * 3. Respects prefers-reduced-motion (skips animation entirely) and
 *    persists a localStorage `ems:transition-sound=off` toggle.
 */

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const STORAGE_KEY = "ems:transition-sound";
const STORAGE_OFF = "off";

function isNavigableClick(e: MouseEvent): { href: string; originX: number; originY: number } | null {
  if (e.defaultPrevented) return null;
  if (e.button !== 0) return null;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  let el = e.target as Element | null;
  while (el && el.nodeName !== "A") el = el.parentElement;
  if (!el) return null;
  const a = el as HTMLAnchorElement;
  if (!a.href) return null;
  if (a.target && a.target !== "" && a.target !== "_self") return null;
  if (a.hasAttribute("download")) return null;
  if (a.getAttribute("rel")?.includes("external")) return null;
  if (a.dataset.noTransition === "true") return null;
  let url: URL;
  try { url = new URL(a.href); } catch { return null; }
  if (url.origin !== window.location.origin) return null;
  if (url.pathname === window.location.pathname && url.search === window.location.search) return null;
  if (url.hash && url.pathname === window.location.pathname) return null;
  return { href: url.pathname + url.search, originX: e.clientX, originY: e.clientY };
}

let audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!audioCtx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      audioCtx = new Ctor();
    }
    if (audioCtx.state === "suspended") {
      void audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

function playWhoosh(direction: "out" | "in") {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(STORAGE_KEY) === STORAGE_OFF) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const ctx = getAudioCtx();
  if (!ctx) return;

  const now = ctx.currentTime;
  const dur = direction === "out" ? 0.18 : 0.22;

  // Noise-burst whoosh: white noise → bandpass that sweeps. Sounds
  // like air moving past you, which is what we want.
  const bufferSize = Math.floor(ctx.sampleRate * dur);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.2;
  if (direction === "out") {
    filter.frequency.setValueAtTime(2400, now);
    filter.frequency.exponentialRampToValueAtTime(380, now + dur);
  } else {
    filter.frequency.setValueAtTime(420, now);
    filter.frequency.exponentialRampToValueAtTime(2200, now + dur);
  }

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(direction === "out" ? 0.18 : 0.12, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(now);
  src.stop(now + dur + 0.05);
}

export default function RouteTransition() {
  const pathname = usePathname();
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const isLeavingRef = useRef(false);
  const lastPathRef = useRef(pathname);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    function onClickCapture(e: MouseEvent) {
      const nav = isNavigableClick(e);
      if (!nav) return;
      const overlay = overlayRef.current;
      if (!overlay) return;
      isLeavingRef.current = true;
      // Position the wipe origin at the click point so the liquid
      // sweep feels like it "comes from" the link.
      overlay.style.setProperty("--ox", `${nav.originX}px`);
      overlay.style.setProperty("--oy", `${nav.originY}px`);
      overlay.classList.remove("rt-enter");
      // force reflow so the state change is observed even if we're
      // already mid-animation from a previous click
      void overlay.offsetWidth;
      overlay.classList.add("rt-leave");
      playWhoosh("out");
    }

    document.addEventListener("click", onClickCapture, { capture: true });
    return () => document.removeEventListener("click", onClickCapture, { capture: true });
  }, []);

  // When the path changes, run the "entering" animation.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    if (lastPathRef.current === pathname) return;
    lastPathRef.current = pathname;

    const overlay = overlayRef.current;
    if (!overlay) return;
    if (!isLeavingRef.current) {
      // Path changed without a click (back/forward, programmatic
      // router.push). Show a quick overlay anyway so it still feels
      // intentional.
      overlay.style.setProperty("--ox", "50vw");
      overlay.style.setProperty("--oy", "50vh");
      overlay.classList.add("rt-leave");
      playWhoosh("out");
      // After a frame, switch to enter so the overlay melts away.
      requestAnimationFrame(() => {
        overlay.classList.remove("rt-leave");
        overlay.classList.add("rt-enter");
      });
    } else {
      overlay.classList.remove("rt-leave");
      overlay.classList.add("rt-enter");
    }
    isLeavingRef.current = false;
    playWhoosh("in");

    // Window scroll-to-top happens before this fires, so the wipe
    // covers the visual jump cleanly.
    const t = window.setTimeout(() => {
      overlay.classList.remove("rt-enter");
    }, 400);
    return () => window.clearTimeout(t);
  }, [pathname]);

  return <div ref={overlayRef} className="rt-overlay" aria-hidden />;
}
