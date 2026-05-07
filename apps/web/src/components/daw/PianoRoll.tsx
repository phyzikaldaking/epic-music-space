"use client";

import { useEffect, useRef } from "react";
import type { MidiClip } from "./dawEngine";

interface Props {
  clip: MidiClip;
  /** Synth track color so it reads as belonging to the Synth strip. */
  color: string;
  /** Optional live playhead position in beats (mod clip length) for a
   *  thin scanning overlay. */
  positionBeats?: number;
}

/**
 * View-only piano-roll renderer. Notes are colored rectangles laid out
 * by start beat (x) and pitch (y). Editable piano roll (drag to move,
 * resize, etc.) is the obvious next step but a big surface — this is
 * the read-only foundation that confirms recording captured what the
 * user played.
 */
export default function PianoRoll({ clip, color, positionBeats }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const dpr = Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, 1.5);
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (clip.notes.length === 0) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText("(empty clip)", 8, 16);
      return;
    }

    // Pitch range from data, padded by a couple of semitones for breathing room.
    const noteValues = clip.notes.map((n) => n.note);
    const minNote = Math.max(0, Math.min(...noteValues) - 2);
    const maxNote = Math.min(127, Math.max(...noteValues) + 2);
    const pitchSpan = Math.max(12, maxNote - minNote);

    // Beat grid every quarter — light vertical lines.
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    for (let b = 0; b <= clip.lengthBeats; b++) {
      const x = (b / clip.lengthBeats) * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Notes.
    for (const n of clip.notes) {
      const x = (n.startBeat / clip.lengthBeats) * w;
      const widthPx = Math.max(2, (n.durationBeats / clip.lengthBeats) * w);
      const yIndex = maxNote - n.note;
      const yStep = h / pitchSpan;
      const y = yIndex * yStep;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.4 + 0.5 * Math.max(0.1, Math.min(1, n.velocity));
      ctx.fillRect(x, y, widthPx, Math.max(2, yStep - 1));
      ctx.globalAlpha = 1;
    }

    // Playhead overlay.
    if (positionBeats !== undefined && clip.lengthBeats > 0) {
      const localBeat = positionBeats % clip.lengthBeats;
      const px = (localBeat / clip.lengthBeats) * w;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
    }
  }, [clip, color, positionBeats]);

  return (
    <div className="relative h-20 w-full overflow-hidden rounded-lg bg-black/40 ring-1 ring-white/5">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
