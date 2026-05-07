"use client";

import { useEffect, useRef } from "react";
import { getAudioLevel } from "@/lib/audioReactivity";

/**
 * Lightweight animated background — bulletproof variant.
 *
 * Three thematic variants — "hero", "versus", "vault" — drawn on a
 * single 2D canvas so we get one GPU-accelerated layer per page rather
 * than stacking CSS animations.
 *
 * Bulletproofing stack (in priority order — most-likely failure first):
 *
 *   1. Try/catch around every animation tick. A single bad frame
 *      cannot kill the loop. Three consecutive errors triggers the
 *      circuit breaker and we self-disable for the rest of the session.
 *   2. Adaptive quality. Particle count is multiplied by 0..1 based on
 *      device memory, CPU cores, network save-data, viewport width.
 *      A 2GB Android on slow-2g sees ~10 particles; a desktop with
 *      8 cores + fiber sees the configured max.
 *   3. Live prefers-reduced-motion listener. Toggling it in OS settings
 *      stops the canvas without a page reload.
 *   4. Pause when off-screen (IntersectionObserver) AND when tab is
 *      hidden (visibilitychange) AND when running flag is false.
 *   5. localStorage kill switch — `ems-disable-bg=1` opts out for any
 *      user reporting issues. Bulletproof escape hatch for support.
 *   6. rAF only schedules next frame while running — no leak path on
 *      rapid mount/unmount or React StrictMode double-effect.
 *   7. Cleanup is idempotent — repeated calls during teardown are safe.
 *   8. devicePixelRatio capped at 1.5 — retina tax measured to be the
 *      single biggest perf win on M-series Macs.
 *   9. 2D canvas only, no WebGL — sidesteps GPU driver crashes / OS
 *      context-creation limits / GPU blacklisting.
 */

type Variant = "hero" | "versus" | "vault";

interface Props {
  variant: Variant;
  className?: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  hue: number;
  life: number;
  maxLife: number;
  /**
   * Depth layer: 0 = background (smaller, dimmer, less parallax), 1 =
   * foreground (bigger, brighter, more parallax). Set once at spawn.
   */
  depth: 0 | 1;
}

const CONFIGS: Record<
  Variant,
  {
    particleCount: number;
    behavior: "spark" | "drift" | "battle";
    palette: number[];
  }
> = {
  hero: { particleCount: 50, behavior: "spark", palette: [320, 200, 280] },
  versus: { particleCount: 70, behavior: "battle", palette: [330, 195, 45] },
  vault: { particleCount: 50, behavior: "drift", palette: [40, 30, 25] },
};

const KILL_SWITCH_KEY = "ems-disable-bg";
const MAX_CONSECUTIVE_ERRORS = 3;

/**
 * Probe the current device + network and return a 0..1 multiplier we
 * apply to the configured particle count. Returns 0 to disable entirely.
 * All probes are wrapped — Safari has shipped weird Navigator APIs over
 * the years that can throw on access.
 */
function computeQualityFactor(): number {
  if (typeof window === "undefined" || typeof navigator === "undefined") return 1;

  // Hard kill-switch — set by support / power user to disable backdrops
  // entirely. Lives in localStorage so it persists across reloads.
  try {
    if (window.localStorage.getItem(KILL_SWITCH_KEY) === "1") return 0;
  } catch {
    /* localStorage can throw in private mode / sandboxed iframes */
  }

  let factor = 1;

  // Network: explicit save-data trumps everything.
  try {
    const conn = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    if (conn?.saveData) return 0;
    if (conn?.effectiveType === "slow-2g" || conn?.effectiveType === "2g") {
      factor *= 0.25;
    } else if (conn?.effectiveType === "3g") {
      factor *= 0.6;
    }
  } catch {
    /* connection API absent on Safari/Firefox */
  }

  // Memory: deviceMemory is reported in GB, browsers cap at 8.
  try {
    const memGb = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (typeof memGb === "number") {
      if (memGb <= 1) factor *= 0.2;
      else if (memGb <= 2) factor *= 0.4;
      else if (memGb <= 4) factor *= 0.7;
    }
  } catch {
    /* deviceMemory absent on Safari */
  }

  // CPU cores: many low-end Android phones report 4 cores but throttle.
  try {
    const cores = navigator.hardwareConcurrency ?? 4;
    if (cores <= 2) factor *= 0.5;
    else if (cores <= 4) factor *= 0.8;
  } catch {
    /* should never throw, defensive */
  }

  // Viewport: smaller screens get fewer particles per the visual budget,
  // independent of device class.
  if (typeof window !== "undefined") {
    if (window.innerWidth < 380) factor *= 0.5;
    else if (window.innerWidth < 768) factor *= 0.75;
  }

  return Math.max(0, Math.min(1, factor));
}

export default function AnimatedBackdrop({ variant, className = "" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    if (typeof window === "undefined") return;

    // Reduced-motion: respect at mount AND when toggled live.
    const reducedMotionMql = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = reducedMotionMql.matches;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) {
      // Browser refused — out of contexts (Chrome cap is ~16 across the
      // page), or context creation blacklisted. Fail closed and silent.
      return;
    }

    const config = CONFIGS[variant];
    const qualityFactor = computeQualityFactor();
    const targetParticles = Math.floor(config.particleCount * qualityFactor);

    if (qualityFactor === 0 || reducedMotion || targetParticles === 0) {
      // No animation — the static CSS gradient under the wrapper still
      // shows. Do nothing else.
      const onMotionChange = () => {
        // If user re-enables motion mid-session, don't bring the canvas
        // back automatically — that would require re-running this whole
        // effect. They get the static gradient until next navigation.
      };
      reducedMotionMql.addEventListener?.("change", onMotionChange);
      return () => {
        reducedMotionMql.removeEventListener?.("change", onMotionChange);
      };
    }

    const particles: Particle[] = [];
    let width = 0;
    let height = 0;
    let dpr = 1;
    let rafId = 0;
    let lastTick = 0;
    let frameCount = 0;
    let running = true;
    let visible = true;
    let errorStreak = 0;
    // Mouse parallax: targetMouseX/Y in [-1, 1] are the latest cursor
    // position, mouseX/Y are the smoothed values used for actual draw.
    // Lerping prevents jitter on fast cursor moves.
    let targetMouseX = 0;
    let targetMouseY = 0;
    let mouseX = 0;
    let mouseY = 0;

    const FRAME_MS = 1000 / 30;

    function resize() {
      if (!wrapper || !canvas || !ctx) return;
      const rect = wrapper.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      // Guard against pathological huge canvases (browser caps vary by
      // device — Safari iOS is ~16M pixels). 4096x4096 is plenty for any
      // hero, and far below all known caps.
      const maxDim = 4096;
      const cw = Math.min(width * dpr, maxDim);
      const ch = Math.min(height * dpr, maxDim);
      canvas.width = cw;
      canvas.height = ch;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(cw / width, 0, 0, ch / height, 0, 0);
    }

    function spawn(p: Particle) {
      const palette = config.palette;
      p.hue = palette[Math.floor(Math.random() * palette.length)] ?? 0;
      p.maxLife = 180 + Math.random() * 240;
      p.life = Math.random() * p.maxLife;
      p.alpha = 0;
      // 35% foreground, 65% background — reads as layered depth without
      // overwhelming the foreground. Foreground particles get a size +
      // velocity boost; background stays subtle.
      p.depth = Math.random() < 0.35 ? 1 : 0;
      const depthScale = p.depth === 1 ? 1.4 : 0.7;
      p.size = (0.6 + Math.random() * 1.8) * depthScale;

      switch (config.behavior) {
        case "spark":
          p.x = Math.random() * width;
          p.y = height * (0.2 + Math.random() * 0.8);
          p.vx = (Math.random() - 0.5) * 0.15 * depthScale;
          p.vy = (-0.15 - Math.random() * 0.35) * depthScale;
          break;
        case "drift":
          p.x = Math.random() * width;
          p.y = Math.random() * height;
          p.vx = (Math.random() - 0.5) * 0.18 * depthScale;
          p.vy = (Math.random() - 0.5) * 0.18 * depthScale;
          break;
        case "battle": {
          const leftSide = Math.random() < 0.5;
          p.x = leftSide
            ? Math.random() * width * 0.45
            : width * 0.55 + Math.random() * width * 0.45;
          p.y = Math.random() * height;
          p.vx = (leftSide ? 1 : -1) * (0.05 + Math.random() * 0.18) * depthScale;
          p.vy = (Math.random() - 0.5) * 0.2 * depthScale;
          p.hue = leftSide ? 330 : 195;
          p.size = (0.8 + Math.random() * 2) * depthScale;
          break;
        }
      }
    }

    function init() {
      particles.length = 0;
      for (let i = 0; i < targetParticles; i++) {
        const p: Particle = {
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          size: 1,
          alpha: 0,
          hue: 0,
          life: 0,
          maxLife: 1,
          depth: 0,
        };
        spawn(p);
        particles.push(p);
      }
    }

    function tick(now: number) {
      if (!ctx) return;
      if (now - lastTick < FRAME_MS) return;
      lastTick = now;
      frameCount++;

      // iOS Safari can clear the canvas under memory pressure. Detect
      // by checking dimensions match what we expect; if not, recover by
      // re-running resize. Cheap (one DOMRect read).
      if (canvas && (canvas.width === 0 || canvas.height === 0)) {
        resize();
        return;
      }

      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation =
        config.behavior === "drift" ? "source-over" : "lighter";

      // Smooth mouse toward target (lerp ~0.15) — fast enough to feel
      // responsive, slow enough to never jitter on a stationary cursor.
      mouseX += (targetMouseX - mouseX) * 0.15;
      mouseY += (targetMouseY - mouseY) * 0.15;

      // Audio-reactive multiplier. 0 when nothing is playing → particles
      // look identical to the non-reactive version. Up to ~1 on bass
      // hits → particles momentarily ~1.6× size and brighter.
      const level = getAudioLevel();
      const audioBoost = 1 + level * 0.6; // 1..1.6
      const audioAlphaBoost = 1 + level * 0.4; // 1..1.4
      // Per-frame seam pulse for the versus arena syncs with audio when
      // present, falls back to fixed cadence when silent.
      const seamPulse = level > 0.05 ? level : (frameCount % 30 === 0 ? 0.4 : 0);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.life++;

        const t = p.life / p.maxLife;
        p.alpha = Math.sin(t * Math.PI) * 0.85;

        const off =
          p.x < -10 || p.x > width + 10 || p.y < -10 || p.y > height + 10;
        if (p.life >= p.maxLife || off) {
          spawn(p);
          continue;
        }

        // Per-depth parallax: foreground shifts ~12px max, background
        // ~4px max. Subtle by design — overcorrected parallax reads as
        // "drunk camera," not "premium." mouseX/mouseY are in [-1, 1].
        const parallaxStrength = p.depth === 1 ? 12 : 4;
        const px = p.x + mouseX * parallaxStrength;
        const py = p.y + mouseY * parallaxStrength;

        ctx.beginPath();
        const breath = 1 + Math.sin(p.life * 0.05) * 0.15;
        const radius = p.size * breath * audioBoost;
        const drawAlpha = Math.min(1, p.alpha * audioAlphaBoost);
        ctx.fillStyle = `hsla(${p.hue}, 90%, 70%, ${drawAlpha})`;
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      if (config.behavior === "battle" && seamPulse > 0) {
        const seamX = width / 2;
        const grad = ctx.createLinearGradient(seamX - 60, 0, seamX + 60, 0);
        // Seam intensity scales with seamPulse — audio-driven when music
        // plays, dim periodic flash otherwise. Same gold color throughout.
        const peak = 0.12 + seamPulse * 0.45;
        grad.addColorStop(0, "rgba(245,200,80,0)");
        grad.addColorStop(0.5, `rgba(245,200,80,${peak.toFixed(3)})`);
        grad.addColorStop(1, "rgba(245,200,80,0)");
        ctx.fillStyle = grad;
        const widthPx = 120 + level * 80; // wider on heavy bass
        ctx.fillRect(seamX - widthPx / 2, 0, widthPx, height);
      }
    }

    function step(now: number) {
      // Schedule the next frame ONLY while running. Any earlier code
      // path that nulls running will halt the loop after this iteration.
      if (!running) return;

      if (visible && !reducedMotion) {
        try {
          tick(now);
          errorStreak = 0;
        } catch (err) {
          errorStreak++;
          // Throwing every frame would spam telemetry. Log once per
          // outage burst, then either recover or trip the breaker.
          if (errorStreak === 1) {
            console.warn("[AnimatedBackdrop] tick error", err);
          }
          if (errorStreak >= MAX_CONSECUTIVE_ERRORS) {
            console.warn(
              `[AnimatedBackdrop] disabled after ${errorStreak} errors`,
            );
            running = false;
            return;
          }
        }
      }

      rafId = requestAnimationFrame(step);
    }

    // Pause when wrapper scrolls off-screen — Vault page doesn't burn
    // CPU when reading the FAQ at the bottom of landing page.
    let io: IntersectionObserver | null = null;
    try {
      io = new IntersectionObserver(
        ([entry]) => {
          visible = entry?.isIntersecting ?? false;
        },
        { threshold: 0 },
      );
      io.observe(wrapper);
    } catch {
      // Older browsers without IntersectionObserver: assume always visible.
      visible = true;
    }

    function handleVisibility() {
      visible = !document.hidden;
    }
    document.addEventListener("visibilitychange", handleVisibility);

    // Mouse parallax. Listen on the *parent* of the wrapper (the hero
    // section) so cursor anywhere in that section drives the effect,
    // not just over the wrapper itself (which is pointer-events-none
    // anyway). On touch devices this never fires — degrades cleanly.
    const parallaxTarget = wrapper.parentElement ?? wrapper;
    function handleMouse(ev: MouseEvent) {
      const rect = parallaxTarget.getBoundingClientRect();
      // Normalize to [-1, 1] across the section.
      const nx = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((ev.clientY - rect.top) / rect.height) * 2 - 1;
      // Clamp — cursor outside the section reads as 0 (no shift).
      targetMouseX = Math.max(-1, Math.min(1, nx));
      targetMouseY = Math.max(-1, Math.min(1, ny));
    }
    function handleMouseLeave() {
      targetMouseX = 0;
      targetMouseY = 0;
    }
    try {
      parallaxTarget.addEventListener("mousemove", handleMouse, { passive: true });
      parallaxTarget.addEventListener("mouseleave", handleMouseLeave, { passive: true });
    } catch {
      /* no-op */
    }

    function handleMotionChange(e: MediaQueryListEvent) {
      reducedMotion = e.matches;
      if (reducedMotion && ctx) {
        // Clear the canvas so the static gradient is the only visible
        // layer until next navigation.
        try {
          ctx.clearRect(0, 0, width, height);
        } catch {
          /* no-op */
        }
      }
    }
    reducedMotionMql.addEventListener?.("change", handleMotionChange);

    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(() => {
        try {
          resize();
        } catch (err) {
          console.warn("[AnimatedBackdrop] resize error", err);
        }
      });
      ro.observe(wrapper);
    } catch {
      // Older Safari without ResizeObserver: rely on initial sizing.
    }

    try {
      resize();
      init();
      rafId = requestAnimationFrame(step);
    } catch (err) {
      console.warn("[AnimatedBackdrop] init error", err);
      running = false;
    }

    return () => {
      // Idempotent cleanup — every step is wrapped so a torn-down
      // observer / listener calling cleanup again is safe.
      running = false;
      try {
        cancelAnimationFrame(rafId);
      } catch {
        /* no-op */
      }
      try {
        io?.disconnect();
      } catch {
        /* no-op */
      }
      try {
        ro?.disconnect();
      } catch {
        /* no-op */
      }
      try {
        document.removeEventListener("visibilitychange", handleVisibility);
      } catch {
        /* no-op */
      }
      try {
        reducedMotionMql.removeEventListener?.("change", handleMotionChange);
      } catch {
        /* no-op */
      }
      try {
        parallaxTarget.removeEventListener("mousemove", handleMouse);
        parallaxTarget.removeEventListener("mouseleave", handleMouseLeave);
      } catch {
        /* no-op */
      }
    };
  }, [variant]);

  return (
    <div
      ref={wrapperRef}
      aria-hidden="true"
      className={`ems-backdrop ems-backdrop--${variant} pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
