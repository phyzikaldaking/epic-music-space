"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DawEngine } from "./dawEngine";

// Sample chopper. Producer drops a loop / breakbeat / vocal phrase;
// the engine's transient detector finds slice boundaries; the modal
// previews each slice and lets the producer either drop all slices
// as new tracks (one-shot pads) or pick a single slice. The slices
// are written back as new tracks via engine.addTrack +
// engine.setTrackBuffer.

type Props = {
  engine: DawEngine;
  open: boolean;
  onClose: () => void;
  onNotice: (tone: "success" | "error" | "info", message: string) => void;
};

export default function SampleChopperModal({
  engine,
  open,
  onClose,
  onNotice,
}: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [slices, setSlices] = useState<number[]>([]);
  const [name, setName] = useState("Chop");

  useEffect(() => {
    if (!open) {
      setBuffer(null);
      setSlices([]);
    }
  }, [open]);

  async function onFile(file: File) {
    setName(file.name.replace(/\.[^.]+$/, "").slice(0, 30) || "Chop");
    // Decode through the engine's audio context — re-creating a
    // separate ctx just for the preview would risk a sample-rate
    // mismatch when we hand the slices back to the engine.
    const ctx = engine.audioContext;
    if (!ctx) {
      onNotice("error", "Press play first to wake the audio engine.");
      return;
    }
    try {
      const arr = await file.arrayBuffer();
      const buf = await ctx.decodeAudioData(arr);
      setBuffer(buf);
      const detected = engine.detectTransients(buf, 16);
      // Always include 0 as the first slice so the head of the buffer
      // doesn't get discarded.
      const withHead = detected[0] === 0 ? detected : [0, ...detected];
      setSlices(withHead);
    } catch (err) {
      console.warn("[SampleChopper] decode failed", err);
      onNotice("error", "Couldn't decode that file — try WAV or MP3.");
    }
  }

  function buildSliceBuffer(start: number, end: number): AudioBuffer | null {
    const ctx = engine.audioContext;
    if (!ctx || !buffer) return null;
    const sr = buffer.sampleRate;
    const startFrame = Math.max(0, Math.floor(start * sr));
    const endFrame = Math.min(buffer.length, Math.floor(end * sr));
    const len = Math.max(1, endFrame - startFrame);
    const out = ctx.createBuffer(buffer.numberOfChannels, len, sr);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const inData = buffer.getChannelData(ch);
      const outData = out.getChannelData(ch);
      for (let i = 0; i < len; i++) outData[i] = inData[startFrame + i] ?? 0;
    }
    return out;
  }

  function dropAllSlices() {
    if (!buffer || slices.length === 0) return;
    let dropped = 0;
    for (let i = 0; i < slices.length; i++) {
      const start = slices[i];
      const end = i + 1 < slices.length ? slices[i + 1] : buffer.duration;
      const buf = buildSliceBuffer(start, end);
      if (!buf) continue;
      const trackId = engine.addTrack(`${name} ${i + 1}`, "#a78bfa");
      engine.setTrackBuffer(trackId, buf);
      dropped++;
    }
    onNotice(
      "success",
      `Dropped ${dropped} slices as new tracks — colour them, pan them, you've got a kit.`,
    );
    onClose();
  }

  const peaks = useMemo(() => {
    if (!buffer) return [];
    const data = buffer.getChannelData(0);
    const bins = 240;
    const block = Math.max(1, Math.floor(data.length / bins));
    const out: number[] = new Array(bins).fill(0);
    for (let i = 0; i < bins; i++) {
      let p = 0;
      for (let j = 0; j < block; j++) {
        const v = Math.abs(data[i * block + j] ?? 0);
        if (v > p) p = v;
      }
      out[i] = p;
    }
    return out;
  }, [buffer]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[170] grid place-items-center bg-black/70 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-violet-400/50 bg-zinc-950 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.32em] text-violet-300">
              Sample chopper
            </div>
            <h2 className="mt-1 font-display text-xl uppercase tracking-wide">
              Auto-slice on transients
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/20 px-3 py-1 text-[10px] uppercase tracking-widest hover:bg-white/10"
          >
            Close
          </button>
        </div>

        {!buffer ? (
          <div className="rounded-xl border border-dashed border-white/20 bg-white/[0.03] p-8 text-center">
            <p className="mb-3 text-sm text-white/65">
              Drop a loop, breakbeat, or vocal phrase. The transient
              detector will find punchy points and slice it up.
            </p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-xl bg-violet-500 px-5 py-2 text-sm font-bold uppercase tracking-widest text-white hover:bg-violet-400"
            >
              Pick a sample
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.currentTarget.value = "";
              }}
            />
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-2">
              <label className="text-[10px] uppercase tracking-widest text-white/55">
                Slice name prefix
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 30))}
                className="flex-1 rounded-md border border-white/15 bg-black/30 px-2 py-1 text-sm outline-none focus:border-violet-400"
              />
            </div>
            <div className="relative rounded-xl border border-white/15 bg-black/40 p-3">
              <svg
                viewBox={`0 0 ${peaks.length} 80`}
                preserveAspectRatio="none"
                className="block w-full"
                style={{ height: 80 }}
              >
                {peaks.map((p, i) => {
                  const h = Math.max(1, p * 76);
                  return (
                    <rect
                      key={i}
                      x={i}
                      y={(80 - h) / 2}
                      width={0.9}
                      height={h}
                      fill="rgba(167,139,250,0.7)"
                    />
                  );
                })}
                {slices.map((s, i) => {
                  const x = (s / buffer.duration) * peaks.length;
                  return (
                    <g key={i}>
                      <line x1={x} x2={x} y1={0} y2={80} stroke="#fbbf24" strokeWidth={0.5} />
                      <text
                        x={x + 1}
                        y={10}
                        fontSize={8}
                        fill="#fbbf24"
                        fontWeight="bold"
                      >
                        {i + 1}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-white/55">
              <span>
                Detected <strong>{slices.length}</strong> slice
                {slices.length === 1 ? "" : "s"} ·{" "}
                {buffer.duration.toFixed(2)}s total
              </span>
              <button
                type="button"
                onClick={() => {
                  // Re-detect, slightly different threshold path —
                  // useful if the auto-detect missed quieter hits.
                  if (!buffer) return;
                  const detected = engine.detectTransients(buffer, 24);
                  setSlices(detected[0] === 0 ? detected : [0, ...detected]);
                }}
                className="rounded-md border border-white/15 px-2 py-1 text-[10px] font-bold uppercase tracking-widest hover:bg-white/10"
              >
                Re-detect (finer)
              </button>
            </div>
            <button
              type="button"
              onClick={dropAllSlices}
              className="mt-4 w-full rounded-xl bg-violet-500 px-4 py-2 text-sm font-bold uppercase tracking-widest text-white hover:bg-violet-400"
            >
              Drop {slices.length} slices as tracks
            </button>
          </>
        )}
      </div>
    </div>
  );
}
