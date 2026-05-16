import React, { useState, useCallback } from "react";
import type { DawEngine } from "./dawEngine";

interface StemSeparationProps {
  engine: DawEngine;
  buffer: AudioBuffer | null;
  open: boolean;
  onClose: () => void;
  onStems?: (stems: { vocal: AudioBuffer; drums: AudioBuffer; bass: AudioBuffer; other: AudioBuffer }) => void;
}

const STEM_LABELS = ["Vocals", "Drums", "Bass", "Other"] as const;

async function urlToAudioBuffer(url: string, ctx: AudioContext): Promise<AudioBuffer> {
  const resp = await fetch(url);
  const arrayBuf = await resp.arrayBuffer();
  return ctx.decodeAudioData(arrayBuf);
}

async function audioBufferToBlob(buffer: AudioBuffer): Promise<Blob> {
  // Encode to WAV in-browser via OfflineAudioContext render + manual WAV header
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const headerSize = 44;
  const wav = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(wav);
  const writeStr = (offset: number, str: string) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([wav], { type: "audio/wav" });
}

export function StemSeparationModal({ engine, buffer, open, onClose, onStems }: StemSeparationProps) {
  const [processing, setProcessing] = useState(false);
  const [stage, setStage] = useState<string>("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [stems, setStems] = useState<Record<string, string | null>>({});

  const startSeparation = useCallback(async () => {
    if (!buffer) return;
    setError(null);
    setProcessing(true);
    setProgress(5);

    try {
      // Step 1: encode AudioBuffer → WAV blob
      setStage("Encoding audio…");
      const blob = await audioBufferToBlob(buffer);
      setProgress(15);

      // Step 2: upload to storage via /api/upload
      setStage("Uploading to cloud…");
      const form = new FormData();
      form.append("file", blob, "stem-source.wav");
      const uploadResp = await fetch("/api/upload", { method: "POST", body: form });
      if (!uploadResp.ok) throw new Error("Upload failed: " + (await uploadResp.text()));
      const { url: audioUrl } = await uploadResp.json();
      setProgress(30);

      // Step 3: kick off Replicate Demucs job
      setStage("Starting stem separation (Demucs)…");
      const startResp = await fetch("/api/studio/stem-separate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioUrl }),
      });
      if (!startResp.ok) {
        const e = await startResp.json();
        throw new Error(e.error ?? "Failed to start separation");
      }
      const { jobId } = await startResp.json();
      setProgress(35);

      // Step 4: poll for completion
      setStage("Separating stems (this takes 30–90s)…");
      let attempts = 0;
      const maxAttempts = 90;
      while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 2000));
        const pollResp = await fetch(`/api/studio/stem-separate/status?jobId=${jobId}`);
        const pollData = await pollResp.json();

        if (pollData.status === "succeeded" && pollData.stems) {
          setProgress(85);
          setStage("Decoding stems…");
          const ctx = engine.audioContext;
          const [vocal, drums, bass, other] = await Promise.all([
            urlToAudioBuffer(pollData.stems.vocals, ctx),
            urlToAudioBuffer(pollData.stems.drums, ctx),
            urlToAudioBuffer(pollData.stems.bass, ctx),
            urlToAudioBuffer(pollData.stems.other, ctx),
          ]);
          setStems({ vocals: pollData.stems.vocals, drums: pollData.stems.drums, bass: pollData.stems.bass, other: pollData.stems.other });
          setProgress(100);
          setStage("Done!");
          onStems?.({ vocal, drums, bass, other });
          break;
        }

        if (pollData.status === "failed") {
          throw new Error(pollData.error ?? "Separation failed");
        }

        attempts++;
        setProgress(35 + Math.min(attempts / maxAttempts * 50, 50));
      }

      if (attempts >= maxAttempts) throw new Error("Timed out waiting for separation");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setProcessing(false);
    }
  }, [buffer, engine, onStems]);

  if (!open) return null;

  const hasResult = Object.values(stems).some(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1a1a2e] p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Stem Separation</h2>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors text-xl leading-none">&times;</button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-900/40 border border-red-500/30 px-4 py-3 text-sm text-red-300">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
          </div>
        )}

        {!processing && !hasResult && (
          <div className="mb-6 text-sm text-white/60">
            <p>Separate your track into <strong className="text-white">Vocals, Drums, Bass,</strong> and <strong className="text-white">Other</strong> stems using AI (Demucs).</p>
            <p className="mt-2 text-xs text-white/40">Takes 30–90 seconds. Requires REPLICATE_API_TOKEN to be configured.</p>
          </div>
        )}

        {processing && (
          <div className="mb-6">
            <p className="mb-2 text-sm text-white/70">{stage}</p>
            <div className="h-2 w-full rounded-full bg-white/10">
              <div
                className="h-2 rounded-full bg-purple-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-white/40">{progress.toFixed(0)}%</p>
          </div>
        )}

        {hasResult && (
          <div className="mb-4 space-y-2">
            {STEM_LABELS.map(label => {
              const key = label.toLowerCase();
              const url = stems[key === "vocals" ? "vocals" : key];
              return (
                <div key={label} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                  <span className="text-sm font-medium text-white">{label}</span>
                  {url ? (
                    <a href={url} download={`${label.toLowerCase()}.wav`} className="text-xs text-purple-400 hover:text-purple-300 underline">
                      Download
                    </a>
                  ) : (
                    <span className="text-xs text-white/30">—</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="rounded border border-white/15 px-4 py-2 text-sm font-bold text-white/70 hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={startSeparation}
            disabled={!buffer || processing}
            className="rounded bg-purple-500 px-4 py-2 font-bold uppercase text-white text-sm hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {processing ? "Processing…" : hasResult ? "Re-separate" : "Separate Stems"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default StemSeparationModal;
