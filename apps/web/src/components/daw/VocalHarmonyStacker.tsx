"use client";

import { useState } from "react";

interface HarmonyVoice {
  id: string;
  interval: number; // semitones above or below original
  gender: "male" | "female" | "neutral";
  character: "bright" | "warm" | "dark";
  wetAmount: number; // 0-1
}

export default function VocalHarmonyStacker({
  trackId,
  onGenerateHarmonies,
}: {
  trackId: string;
  onGenerateHarmonies?: (voices: HarmonyVoice[]) => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [harmonies, setHarmonies] = useState<HarmonyVoice[]>([]);
  const [error, setError] = useState<string | null>(null);

  const defaultHarmonies: HarmonyVoice[] = [
    { id: "harmony-1", interval: 3, gender: "female", character: "bright", wetAmount: 0.8 },
    { id: "harmony-2", interval: 5, gender: "male", character: "warm", wetAmount: 0.7 },
    { id: "harmony-3", interval: -4, gender: "neutral", character: "dark", wetAmount: 0.6 },
  ];

  async function generateHarmonies() {
    setGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/studio/vocal/harmonies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackId,
          harmonyCount: 3,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as unknown;
        throw new Error(data.error || `Generation failed (${res.status})`);
      }

      const result = (await res.json()) as { harmonies: HarmonyVoice[] };
      setHarmonies(result.harmonies || defaultHarmonies);
      onGenerateHarmonies?.(result.harmonies || defaultHarmonies);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setHarmonies(defaultHarmonies);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="rounded-lg border border-white/10 bg-[#0c0c12] p-4">
      <h3 className="text-sm font-bold text-white mb-3">🎤 Vocal Harmony Stacker</h3>

      <button
        onClick={generateHarmonies}
        disabled={generating}
        className="w-full px-4 py-2 text-xs font-bold rounded bg-tube-300 text-black hover:bg-tube-200 disabled:opacity-50 mb-3"
      >
        {generating ? "Generating…" : "✨ Generate AI Harmonies"}
      </button>

      {error && <div className="text-xs text-red-400 mb-3">{error}</div>}

      {harmonies.length > 0 && (
        <div className="space-y-2">
          {harmonies.map((voice) => (
            <div key={voice.id} className="rounded bg-white/5 p-2">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-white">
                  {voice.interval > 0 ? "+" : ""}
                  {voice.interval} semitones • {voice.gender}
                </p>
                <p className="text-[10px] text-white/50">{voice.character}</p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-white/60">Wet</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  defaultValue={voice.wetAmount}
                  className="flex-1"
                />
                <span className="text-[10px] text-white/60">
                  {Math.round(voice.wetAmount * 100)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 text-[10px] text-white/50">
        AI generates 2-3 harmonic voices using ElevenLabs voice cloning + pitch detection.
      </p>
    </div>
  );
}
