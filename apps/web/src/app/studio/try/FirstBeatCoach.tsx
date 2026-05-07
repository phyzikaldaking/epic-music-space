"use client";

/**
 * "Press play to hear your beat" coachmark for guest visitors.
 *
 * The DAW already seeds a four-on-the-floor demo pattern on mount, but
 * a brand-new visitor doesn't know there's anything to play — they see
 * a transport bar with no obvious first action and bounce. This anchors
 * a small pulsing arrow above the play button (via [data-tour="play-button"])
 * and a short tip card. It auto-dismisses on first play, on dismiss
 * click, or after 14s. Persists per-browser so we don't nag returners.
 */

import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "ems-first-beat-coach-dismissed-v1";
const AUTO_DISMISS_MS = 14_000;
const SHOW_DELAY_MS = 1_400;

interface Anchor {
  top: number;
  left: number;
  width: number;
  height: number;
}

export default function FirstBeatCoach() {
  const [visible, setVisible] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    try { if (window.localStorage.getItem(STORAGE_KEY) === "1") return; } catch { /* private */ }

    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      setVisible(false);
      try { window.localStorage.setItem(STORAGE_KEY, "1"); } catch { /* private */ }
      observerRef.current?.disconnect();
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    function findPlayButton(): HTMLElement | null {
      return document.querySelector<HTMLElement>('[data-tour="play-button"]');
    }

    function updateAnchor() {
      const btn = findPlayButton();
      if (!btn) {
        setAnchor(null);
        return;
      }
      const r = btn.getBoundingClientRect();
      setAnchor({ top: r.top, left: r.left, width: r.width, height: r.height });
    }

    // Wait until the DAW renders the play button, then anchor.
    const startTimer = window.setTimeout(() => {
      updateAnchor();
      setVisible(true);

      // Track resize/scroll so the coachmark follows the button.
      window.addEventListener("scroll", updateAnchor, { passive: true });
      window.addEventListener("resize", updateAnchor);

      // Detect a play press: poll for the button's aria-label flipping
      // to "Stop" (set by the DAW when isPlaying becomes true).
      intervalRef.current = window.setInterval(() => {
        const btn = findPlayButton();
        if (btn?.getAttribute("aria-label") === "Stop") dismiss();
      }, 250);

      // Hard timeout so we never linger.
      window.setTimeout(dismiss, AUTO_DISMISS_MS);
    }, SHOW_DELAY_MS);

    // Observe DOM for the play button appearing late (DAW boots async).
    const obs = new MutationObserver(() => updateAnchor());
    obs.observe(document.body, { childList: true, subtree: true });
    observerRef.current = obs;

    return () => {
      window.clearTimeout(startTimer);
      window.removeEventListener("scroll", updateAnchor);
      window.removeEventListener("resize", updateAnchor);
      obs.disconnect();
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  if (!visible || !anchor) return null;

  // Position the coach card just above the play button.
  const cardTop = anchor.top - 110;
  const cardLeft = Math.max(12, Math.min(window.innerWidth - 280, anchor.left + anchor.width / 2 - 130));

  return (
    <>
      {/* Pulsing halo around the play button itself */}
      <div
        aria-hidden
        className="pointer-events-none fixed z-40 rounded-full"
        style={{
          top: anchor.top - 6,
          left: anchor.left - 6,
          width: anchor.width + 12,
          height: anchor.height + 12,
          boxShadow: "0 0 0 0 rgba(168, 85, 247, 0.55)",
          animation: "fbcPulse 1.6s ease-out infinite",
        }}
      />
      {/* Coach card */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto fixed z-40 w-[260px] rounded-xl border border-amber-400/40 bg-gradient-to-br from-amber-400/15 via-fuchsia-500/15 to-cyan-400/10 p-3 text-xs shadow-2xl backdrop-blur-md"
        style={{ top: cardTop, left: cardLeft }}
      >
        <div className="flex items-start gap-2">
          <span aria-hidden className="text-base">🎧</span>
          <div className="flex-1">
            <p className="font-extrabold text-white">Press play to hear your beat</p>
            <p className="mt-1 leading-snug text-white/75">
              We loaded a starter pattern — tap ▶ and the room is on.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setVisible(false);
              try { window.localStorage.setItem(STORAGE_KEY, "1"); } catch { /* */ }
            }}
            aria-label="Dismiss"
            className="-mr-1 -mt-1 flex-shrink-0 rounded p-1 text-white/55 hover:bg-white/10 hover:text-white"
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" /></svg>
          </button>
        </div>
        {/* Down arrow pointer pointing at the button */}
        <div
          aria-hidden
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 h-3 w-3 rotate-45 border-b border-r border-amber-400/40 bg-gradient-to-br from-fuchsia-500/25 to-cyan-400/10"
        />
      </div>
      <style jsx global>{`
        @keyframes fbcPulse {
          0%   { box-shadow: 0 0 0 0 rgba(168, 85, 247, 0.55); }
          70%  { box-shadow: 0 0 0 16px rgba(168, 85, 247, 0); }
          100% { box-shadow: 0 0 0 0 rgba(168, 85, 247, 0); }
        }
      `}</style>
    </>
  );
}
