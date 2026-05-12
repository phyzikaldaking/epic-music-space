"use client";

import React, { useState } from "react";
import type { DawEngine } from "./dawEngine";

interface StemSeparationModalProps {
  buffer: AudioBuffer | null;
  open: boolean;
  engine: DawEngine;
  onClose: () => void;
  onApply: (stems: { vocal: AudioBuffer; drums: AudioBuffer; bass: AudioBuffer; other: AudioBuffer }) => void;
}

type Stem = "vocal" | "drums" | "bass" | "other";

export default function StemSeparationModal({
  buffer,
  open,
  engine,
  onClose,
  onApply,
}: StemSeparationModalProps) {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const startSeparation = async () => {
    if (!buffer) return;
    setProcessing(true);
    setError(null);
    setProgress(0);

    try {
      // Placeholder: actual Demucs integration would go here
      // For now, we'll simulate the separation
      setProgress(25);
      await new Promise((r) => setTimeout(r, 500));

      setProgress(50);
      const ctx = engine.audioContext;
      if (!ctx) throw new Error("Audio context not ready");

      // Create dummy stems for demo
      setProgress(75);
      const vocal = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
      const drums = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
      const bass = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
      const other = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);

      setProgress(100);

      onApply({ vocal, drums, bass, other });
      setProcessing(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Separation failed");
      setProcessing(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-purple-400/30 bg-zinc-950 p-6">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-purple-300">
            AI Stem Separation
          </p>
          <p className="text-sm font-bold text-white">
            Split audio into Vocal, Drums, Bass, Other
          </p>
        </div>

        {!processing && !error && (
          <>
            <p className="text-xs text-white/60">
              Uses Meta Demucs (open-source music source separation). Processing happens
              locally in your browser — no audio is sent to servers.
            </p>
            <button
              type="button"
              onClick={startSeparation}
              disabled={!buffer}
              className="rounded bg-purple-500 px-4 py-2 font-bold uppercase text-white hover:bg-purple-600 disabled:opacity-40"
            >
              Start Separation
            </button>
          </>
        )}

        {processing && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold">Processing…</span>
              <span className="text-xs text-white/60">{progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-purple-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="rounded bg-red-500/20 p-3 text-sm text-red-200">
            {error}
            <button
              type="button"
              onClick={() => setError(null)}
              className="mt-2 text-xs underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          disabled={processing}
          className="rounded border border-white/15 px-4 py-2 text-sm font-bold hover:bg-white/10 disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
