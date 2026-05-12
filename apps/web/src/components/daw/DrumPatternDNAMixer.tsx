"use client";

import { useState } from "react";

export default function DrumPatternDNAMixer() {
  const [genreA, setGenreA] = useState("trap");
  const [genreB, setGenreB] = useState("dnb");
  const [blend, setBlend] = useState(0.5); // 0 = genreA, 1 = genreB
  const [generating, setGenerating] = useState(false);

  async function generateBlend() {
    setGenerating(true);
    try {
      const res = await fetch("/api/studio/patterns/dna-blend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ genreA, genreB, blend }),
      });
      if (!res.ok) throw new Error("Blend failed");
      // Load result into engine
    } catch (err) {
      console.error("Blend failed:", err);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="rounded-lg border border-white/10 bg-[#0c0c12] p-4">
      <h3 className="text-sm font-bold text-white mb-3">🧬 Drum Pattern DNA Mixer</h3>
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <select
            value={genreA}
            onChange={(e) => setGenreA(e.target.value)}
            className="text-xs rounded bg-white/5 border border-white/10 px-2 py-1 text-white"
          >
            {["trap", "house", "dnb", "funk"].map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <select
            value={genreB}
            onChange={(e) => setGenreB(e.target.value)}
            className="text-xs rounded bg-white/5 border border-white/10 px-2 py-1 text-white"
          >
            {["trap", "house", "dnb", "funk"].map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-white/60">
            Blend: {Math.round(blend * 100)}% {genreB}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={blend}
            onChange={(e) => setBlend(parseFloat(e.target.value))}
            className="w-full"
          />
        </div>
        <button
          onClick={generateBlend}
          disabled={generating}
          className="w-full px-4 py-2 text-xs font-bold rounded bg-tube-300 text-black hover:bg-tube-200 disabled:opacity-50"
        >
          {generating ? "Blending…" : "🎛️ Generate Hybrid"}
        </button>
      </div>
    </div>
  );
}
