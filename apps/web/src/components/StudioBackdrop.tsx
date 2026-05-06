"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

interface Props {
  status: "LIVE" | "ENDED";
  imageUrl?: string;
}

const LIVE_STUDIO_PHOTO =
  "https://images.unsplash.com/photo-1598653222000-6b7b7a552625?w=2600&q=90&auto=format&fit=crop";
const ENDED_STUDIO_PHOTO =
  "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=2600&q=90&auto=format&fit=crop";

/**
 * Immersive parallax studio scene. Multiple layered elements track the
 * pointer (or device tilt on mobile) at different rates, creating a real
 * "I'm inside this room and I can lean side-to-side" depth effect.
 *
 * Layer stack (back → front, parallax magnitude in parentheses):
 *   - Studio photograph                                  (slowest, ~6px)
 *   - Console / control-desk LED rail across the bottom  (~12px)
 *   - Acoustic panel lattice on the back wall            (~10px)
 *   - Side rim lights                                    (~16px)
 *   - Floating dust particles in the beam                (~22px)
 *   - ON AIR neon sign                                   (fixed, no parallax)
 *
 * Idle ambient drift keeps the scene alive even when the cursor is still.
 * Reduced-motion users get a static composition.
 */
export default function StudioBackdrop({ status, imageUrl }: Props) {
  const photo = imageUrl ?? (status === "LIVE" ? LIVE_STUDIO_PHOTO : ENDED_STUDIO_PHOTO);
  const live = status === "LIVE";

  const rootRef = useRef<HTMLDivElement>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;

    let raf = 0;
    let target = { x: 0, y: 0 };

    function onMove(e: PointerEvent) {
      // Normalise cursor to [-1, 1] across the viewport.
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      target = {
        x: (e.clientX / w) * 2 - 1,
        y: (e.clientY / h) * 2 - 1,
      };
    }

    function onTilt(e: DeviceOrientationEvent) {
      // Beta = front-to-back tilt (-180..180), gamma = left-to-right (-90..90).
      // Clamp to a comfortable parallax range.
      const gamma = Math.max(-25, Math.min(25, e.gamma ?? 0));
      const beta = Math.max(-25, Math.min(25, (e.beta ?? 0) - 30)); // device held up at ~30°
      target = { x: gamma / 25, y: beta / 25 };
    }

    function tick() {
      // Easing toward target so motion feels analog, not jittery.
      setPointer((prev) => {
        const ease = 0.08;
        return {
          x: prev.x + (target.x - prev.x) * ease,
          y: prev.y + (target.y - prev.y) * ease,
        };
      });
      raf = requestAnimationFrame(tick);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("deviceorientation", onTilt);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("deviceorientation", onTilt);
    };
  }, [reducedMotion]);

  // Magnitude helper — px shift for a layer at the given depth.
  const shift = (depth: number) => ({
    transform: reducedMotion
      ? undefined
      : `translate3d(${pointer.x * depth}px, ${pointer.y * depth * 0.5}px, 0)`,
  });

  return (
    <div
      ref={rootRef}
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#050509]"
      aria-hidden="true"
    >
      {/* Layer 1 — studio photograph. Scaled up so the parallax shift
          never reveals an empty edge. */}
      <div
        className="absolute -inset-x-12 -inset-y-8 will-change-transform"
        style={shift(8)}
      >
        <Image
          src={photo}
          alt=""
          fill
          priority
          sizes="120vw"
          className={`object-cover transition duration-700 ${
            live ? "saturate-110" : "saturate-50 brightness-75"
          }`}
        />
      </div>

      {/* Layer 2 — brand-tinted ambient glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(124,58,237,0.45),transparent_55%),radial-gradient(circle_at_82%_18%,rgba(0,245,255,0.32),transparent_55%),radial-gradient(circle_at_50%_120%,rgba(255,72,128,0.35),transparent_60%)]" />

      {/* Layer 3 — back-wall acoustic panel lattice. Subtle hex grid
          parallaxing slightly faster than the photo. */}
      <div
        className="absolute inset-0 opacity-[0.18] mix-blend-overlay will-change-transform"
        style={{
          ...shift(10),
          backgroundImage:
            "repeating-linear-gradient(60deg, rgba(255,255,255,0.15) 0 1px, transparent 1px 32px), repeating-linear-gradient(-60deg, rgba(255,255,255,0.15) 0 1px, transparent 1px 32px)",
        }}
      />

      {/* Layer 4 — readability scrim. Heavier top + bottom so headings
          and chat stay legible while gear stays visible mid-frame. */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,5,9,0.78)_0%,rgba(5,5,9,0.42)_38%,rgba(5,5,9,0.62)_72%,rgba(5,5,9,0.92)_100%)]" />

      {/* Layer 5 — side rim lights. They translate counter to the
          pointer so leaning right pulls the right rim *into* view. */}
      <div
        className="absolute inset-y-12 left-0 w-px bg-gradient-to-b from-transparent via-rose-400/45 to-transparent will-change-transform"
        style={shift(-16)}
      />
      <div
        className="absolute inset-y-12 right-0 w-px bg-gradient-to-b from-transparent via-cyan-300/40 to-transparent will-change-transform"
        style={shift(-16)}
      />

      {/* Layer 6 — diagonal scan lines + grain texture (no parallax —
          fixed scan lines feel like the camera filter, not the room). */}
      <div className="absolute inset-x-0 top-0 h-full bg-[repeating-linear-gradient(115deg,rgba(255,255,255,0.04)_0_2px,transparent_2px_18px)] mix-blend-screen" />
      <div className="absolute inset-0 opacity-30 mix-blend-overlay [background-image:radial-gradient(rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:3px_3px]" />

      {/* Layer 7 — floating dust particles in the beam. The fastest
          parallax layer — close to the camera. */}
      {!reducedMotion && (
        <div
          className="absolute inset-0 will-change-transform"
          style={shift(22)}
        >
          {DUST_POSITIONS.map((p, i) => (
            <span
              key={i}
              className="absolute h-1 w-1 rounded-full bg-white/40 motion-safe:animate-[dust-drift_var(--dur)_ease-in-out_infinite]"
              style={
                {
                  top: `${p.top}%`,
                  left: `${p.left}%`,
                  opacity: p.opacity,
                  ["--dur" as string]: `${p.dur}s`,
                  animationDelay: `${p.delay}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}

      {/* Layer 8 — console-LED bottom horizon. Pulses softly. */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-rose-400/65 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-rose-500/30 to-transparent blur-md motion-safe:animate-[console-pulse_4s_ease-in-out_infinite]" />

      {/* Layer 9 — ON AIR neon sign. Fixed position, no parallax. */}
      <div className="absolute right-4 top-4 sm:right-8 sm:top-8">
        <div
          className={`flex items-center gap-2.5 rounded-lg border-2 px-3.5 py-1.5 font-black uppercase tracking-[0.32em] shadow-[0_0_28px_rgba(255,72,128,0.55)] backdrop-blur-sm ${
            live
              ? "border-rose-400/85 bg-rose-500/15 text-rose-200"
              : "border-white/15 bg-black/45 text-white/35"
          }`}
        >
          {live && (
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-80" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-400 shadow-[0_0_10px_rgba(255,72,128,0.95)]" />
            </span>
          )}
          <span className="text-[11px]">{live ? "On Air" : "Off Air"}</span>
        </div>
      </div>

      <style jsx global>{`
        @keyframes dust-drift {
          0%, 100% { transform: translate(0, 0); opacity: 0.2; }
          25% { transform: translate(6px, -10px); opacity: 0.55; }
          50% { transform: translate(-4px, -16px); opacity: 0.4; }
          75% { transform: translate(-8px, -6px); opacity: 0.6; }
        }
        @keyframes console-pulse {
          0%, 100% { opacity: 0.65; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// Pre-baked particle positions so server-render and client-hydrate match
// (Math.random() during render would mismatch). 18 particles is enough to
// feel alive without becoming visual noise.
const DUST_POSITIONS = [
  { top: 18, left: 12, opacity: 0.45, dur: 7.2, delay: 0.0 },
  { top: 24, left: 78, opacity: 0.35, dur: 6.4, delay: 1.4 },
  { top: 32, left: 45, opacity: 0.5,  dur: 8.1, delay: 0.6 },
  { top: 41, left: 88, opacity: 0.3,  dur: 5.9, delay: 2.1 },
  { top: 47, left: 22, opacity: 0.55, dur: 7.8, delay: 0.2 },
  { top: 53, left: 64, opacity: 0.4,  dur: 6.7, delay: 1.7 },
  { top: 58, left: 8,  opacity: 0.32, dur: 8.4, delay: 0.9 },
  { top: 62, left: 92, opacity: 0.48, dur: 6.1, delay: 2.5 },
  { top: 68, left: 36, opacity: 0.42, dur: 7.5, delay: 1.1 },
  { top: 71, left: 71, opacity: 0.36, dur: 6.8, delay: 0.4 },
  { top: 75, left: 18, opacity: 0.5,  dur: 7.9, delay: 1.9 },
  { top: 28, left: 55, opacity: 0.38, dur: 8.2, delay: 0.8 },
  { top: 35, left: 82, opacity: 0.44, dur: 6.5, delay: 2.3 },
  { top: 44, left: 5,  opacity: 0.33, dur: 7.4, delay: 0.5 },
  { top: 51, left: 50, opacity: 0.46, dur: 6.9, delay: 1.6 },
  { top: 22, left: 30, opacity: 0.4,  dur: 8.0, delay: 1.2 },
  { top: 65, left: 50, opacity: 0.43, dur: 7.1, delay: 0.7 },
  { top: 38, left: 95, opacity: 0.37, dur: 6.3, delay: 2.0 },
];
