"use client";

/**
 * "You published a track" celebration moment.
 *
 * Why a dedicated page: after a visitor invests minutes-to-hours making
 * a beat and goes through the publish form, dropping them silently on
 * /studio?published=… reads as "that's it?". The publish moment is
 * where pride happens — and people share when they feel pride. So we
 * give them a real moment: 1.5s of confetti + a synthesized "ta-da"
 * chime, the cover + title front and center, and three big share
 * buttons (copy link / X / Instagram-ready caption). Then secondary
 * paths back to the studio + dashboard.
 */

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

interface Song {
  id: string;
  title: string;
  artist: string;
  coverUrl: string | null;
  audioUrl: string;
  licensePrice: number;
}

export default function PublishedCelebration({
  song,
  studioUsername,
}: {
  song: Song;
  studioUsername: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const launchedRef = useRef(false);

  const trackUrl = typeof window !== "undefined"
    ? `${window.location.origin}/track/${song.id}`
    : `/track/${song.id}`;

  const shareCaption = `🎵 New record out now: "${song.title}" — made in @epicmusicspace. License it for $${song.licensePrice.toFixed(0)} → ${trackUrl}`;

  // One-shot: confetti + chime on mount.
  useEffect(() => {
    if (launchedRef.current) return;
    launchedRef.current = true;
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) {
      launchConfetti();
      void playTadaChime();
    }
  }, []);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(trackUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback for browsers that block clipboard from non-https or older safari
      window.prompt("Copy your track URL:", trackUrl);
    }
  }

  return (
    <div className="relative mx-auto max-w-2xl px-4 py-12">
      {/* Glow */}
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 h-[600px] w-[900px] rounded-full bg-gradient-to-br from-amber-400/15 via-fuchsia-500/15 to-cyan-400/10 blur-[140px]" />

      <div className="relative text-center">
        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.3em] text-amber-200">
          🎉 Published
        </p>
        <h1 className="text-4xl font-extrabold leading-tight sm:text-5xl">
          Your record is{" "}
          <span className="bg-gradient-to-r from-amber-300 via-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">live.</span>
        </h1>
        <p className="mt-3 text-sm text-white/65">
          It&apos;s on Epic Music Space. Fans can listen, license, and put it in their tracks.
        </p>
      </div>

      {/* Track card */}
      <div className="relative mt-10 overflow-hidden rounded-3xl border border-white/12 bg-gradient-to-br from-white/5 to-white/0 p-5">
        <div className="flex items-start gap-4">
          <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-900/60 to-accent-900/40 sm:h-32 sm:w-32">
            {song.coverUrl ? (
              <Image src={song.coverUrl} alt={song.title} fill sizes="128px" className="object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-5xl">🎵</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-2xl font-extrabold sm:text-3xl">{song.title}</h2>
            <p className="mt-1 truncate text-sm text-white/55">by {song.artist}</p>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-widest text-emerald-200">
              ● Live · ${song.licensePrice.toFixed(0)} per license
            </p>
          </div>
        </div>

        <audio
          src={song.audioUrl}
          controls
          preload="metadata"
          className="mt-4 w-full rounded-xl"
        />
      </div>

      {/* Share */}
      <div className="relative mt-8">
        <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-widest text-white/55">Share it now</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={copyLink}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 py-3 text-sm font-bold text-white transition hover:bg-white/10"
          >
            {copied ? "✓ Copied!" : "🔗 Copy link"}
          </button>
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareCaption)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 py-3 text-sm font-bold text-white transition hover:bg-white/10"
          >
            𝕏 Post on X
          </a>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(shareCaption);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2200);
              } catch {
                window.prompt("Copy your caption:", shareCaption);
              }
            }}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 py-3 text-sm font-bold text-white transition hover:bg-white/10"
          >
            📸 Caption for IG
          </button>
        </div>
      </div>

      {/* Secondary actions */}
      <div className="relative mt-8 flex flex-col gap-2 sm:flex-row">
        <Link
          href={`/track/${song.id}`}
          className="flex-1 rounded-xl bg-gradient-to-r from-brand-500 to-accent-500 py-3 text-center text-sm font-extrabold text-white shadow-lg shadow-brand-500/25 hover:opacity-95"
        >
          View your track →
        </Link>
        <Link
          href="/studio/board"
          className="flex-1 rounded-xl border border-white/15 bg-white/5 py-3 text-center text-sm font-bold text-white hover:bg-white/10"
        >
          Make another
        </Link>
        {studioUsername && (
          <Link
            href={`/studio/${studioUsername}`}
            className="flex-1 rounded-xl border border-white/15 bg-white/5 py-3 text-center text-sm font-bold text-white hover:bg-white/10"
          >
            See your profile
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Confetti (vanilla canvas, no dep) ─────────────────────────────────
function launchConfetti() {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:240";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) { canvas.remove(); return; }

  const dpr = window.devicePixelRatio || 1;
  function resize() {
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
  }
  resize();

  const colors = ["#fbbf24", "#f43f5e", "#a855f7", "#06b6d4", "#22d3ee", "#f472b6", "#34d399"];
  type Particle = { x: number; y: number; vx: number; vy: number; r: number; color: string; rot: number; vrot: number; life: number };
  const particles: Particle[] = [];
  const N = 140;
  for (let i = 0; i < N; i++) {
    particles.push({
      x: window.innerWidth / 2,
      y: window.innerHeight * 0.4,
      vx: (Math.random() - 0.5) * 18,
      vy: (Math.random() - 1) * 16 - 4,
      r: 4 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)] ?? "#fff",
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.4,
      life: 1,
    });
  }

  const start = performance.now();
  function frame(t: number) {
    if (!ctx) return;
    const dt = 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.vy += 0.55;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;
      p.life -= 0.012 * dt;
      if (p.life <= 0) continue;
      ctx.save();
      ctx.translate(p.x * dpr, p.y * dpr);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.r * dpr, -p.r * 0.4 * dpr, p.r * 2 * dpr, p.r * 0.8 * dpr);
      ctx.restore();
    }
    if (t - start < 2200) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);

  window.addEventListener("resize", resize, { once: true });
}

async function playTadaChime() {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    if (ctx.state === "suspended") { try { await ctx.resume(); } catch { /* */ } }

    // Major triad → octave for that bright "ta-da" feel.
    const notes = [523.25, 659.25, 783.99, 1046.5];
    const start = ctx.currentTime + 0.02;
    notes.forEach((freq, i) => {
      const t = start + i * 0.08;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.65);
    });
    window.setTimeout(() => ctx.close().catch(() => undefined), 1500);
  } catch { /* unsupported */ }
}
