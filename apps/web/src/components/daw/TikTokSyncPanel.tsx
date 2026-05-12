"use client";

import { useState } from "react";
import { detectBPM, classifyGenre } from "@/lib/bpmDetector";
import { generateBeatPattern } from "@/lib/beatGenerator";

interface TikTokSyncPanelProps {
  onBeatGenerated?: (patterns: any[]) => void;
  onBPMDetected?: (bpm: number, genre: string) => void;
}

export default function TikTokSyncPanel({
  onBeatGenerated,
  onBPMDetected,
}: TikTokSyncPanelProps) {
  const [tikTokUrl, setTikTokUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedBPM, setDetectedBPM] = useState<number | null>(null);
  const [detectedGenre, setDetectedGenre] = useState<string | null>(null);

  async function handleSync() {
    if (!tikTokUrl.trim()) {
      setError("Paste a TikTok URL");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Extract audio from TikTok
      const extractRes = await fetch("/api/studio/tiktok/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tikTokUrl }),
      });

      if (!extractRes.ok) {
        const data = (await extractRes.json().catch(() => ({}))) as any;
        throw new Error(
          data.error || `Failed to extract audio (${extractRes.status})`
        );
      }

      const { audioUrl } = (await extractRes.json()) as any;

      // Fetch audio and decode
      const audioRes = await fetch(audioUrl);
      const arrayBuffer = await audioRes.arrayBuffer();

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Detect BPM and genre
      const bpm = await detectBPM(audioBuffer);
      const genre = classifyGenre(audioBuffer);

      setDetectedBPM(bpm);
      setDetectedGenre(genre);
      onBPMDetected?.(bpm, genre);

      // Generate beat pattern
      const patterns = generateBeatPattern(bpm, genre as any);
      onBeatGenerated?.(patterns);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-white/10 bg-[#0c0c12] p-4">
      <h3 className="text-sm font-bold text-white mb-3">Sync to TikTok</h3>

      <div className="flex gap-2 mb-3">
        <input
          type="text"
          placeholder="Paste TikTok URL..."
          value={tikTokUrl}
          onChange={(e) => setTikTokUrl(e.target.value)}
          disabled={loading}
          className="flex-1 px-3 py-2 text-xs rounded bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-tube-300"
        />
        <button
          onClick={handleSync}
          disabled={loading}
          className="px-4 py-2 text-xs font-bold rounded bg-tube-300 text-black hover:bg-tube-200 disabled:opacity-50"
        >
          {loading ? "Syncing…" : "Sync"}
        </button>
      </div>

      {error && <div className="text-xs text-red-400 mb-3">{error}</div>}

      {detectedBPM && (
        <div className="text-xs text-white/60 space-y-1">
          <div>
            ✓ Detected BPM: <span className="text-tube-300 font-bold">{detectedBPM}</span>
          </div>
          <div>
            ✓ Genre: <span className="text-tube-300 font-bold">{detectedGenre}</span>
          </div>
          <div className="text-white/40 mt-2">
            Beat pattern loaded. Hit play to hear it sync to your project.
          </div>
        </div>
      )}
    </div>
  );
}
