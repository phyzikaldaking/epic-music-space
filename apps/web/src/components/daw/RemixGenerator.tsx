"use client";

import { useState } from "react";

const REMIX_STYLES = [
  { id: "lo-fi", label: "Lo-Fi Chill", icon: "🎧" },
  { id: "edm", label: "EDM Bangers", icon: "🔥" },
  { id: "trap", label: "Trap Energy", icon: "💥" },
  { id: "funk", label: "Funk Groove", icon: "🎸" },
  { id: "cinematic", label: "Cinematic", icon: "🎬" },
  { id: "ambient", label: "Ambient", icon: "☁️" },
];

export default function RemixGenerator({
  projectName,
  onRemixGenerated,
}: {
  projectName: string;
  onRemixGenerated?: (remixBlob: Blob, style: string) => void;
}) {
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateRemix() {
    if (!selectedStyle) return;

    setGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/studio/remix/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName,
          style: selectedStyle,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Remix failed (${res.status})`);
      }

      const blob = await res.blob();
      onRemixGenerated?.(blob, selectedStyle);

      setSelectedStyle(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remix generation failed");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="rounded-lg border border-white/10 bg-[#0c0c12] p-4">
      <h3 className="text-sm font-bold text-white mb-4">
        🎚️ One-Click Remix Generator
      </h3>

      <p className="text-xs text-white/60 mb-3">
        Transform &quot;{projectName}&quot; into a new style:
      </p>

      <div className="grid grid-cols-2 gap-2 mb-4">
        {REMIX_STYLES.map((style) => (
          <button
            key={style.id}
            onClick={() => setSelectedStyle(style.id)}
            className={`px-3 py-2 text-xs font-bold rounded transition ${
              selectedStyle === style.id
                ? "bg-tube-300 text-black"
                : "border border-white/20 text-white/70 hover:bg-white/10"
            }`}
          >
            {style.icon} {style.label}
          </button>
        ))}
      </div>

      {error && <div className="text-xs text-red-400 mb-3">{error}</div>}

      <button
        onClick={generateRemix}
        disabled={!selectedStyle || generating}
        className="w-full px-4 py-2 text-xs font-bold rounded bg-tube-300 text-black hover:bg-tube-200 disabled:opacity-50"
      >
        {generating ? "Remixing…" : "✨ Generate Remix"}
      </button>

      <p className="mt-3 text-[10px] text-white/50">
        Applies genre-specific effects, EQ, and track layering. Output loads as a new version.
      </p>
    </div>
  );
}
