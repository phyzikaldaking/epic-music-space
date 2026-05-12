"use client";

import { useState } from "react";

interface MatchedSample {
  id: string;
  name: string;
  genre: string;
  bpm: number;
  key: string;
  similarityScore: number;
  duration: number;
}

export default function VibeMatchBrowser({
  onSampleSelected,
}: {
  onSampleSelected?: (sampleId: string, name: string) => void;
}) {
  const [analyzing, setAnalyzing] = useState(false);
  const [matches, setMatches] = useState<MatchedSample[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filterGenre, setFilterGenre] = useState<string | null>(null);

  async function analyzeAndMatch() {
    setAnalyzing(true);
    setError(null);

    try {
      const res = await fetch("/api/studio/samples/vibe-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // In real implementation, send current mix analysis
          sourceGenre: "trap",
          sourceBpm: 142,
          sourceKey: "C",
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as any;
        throw new Error(data.error || `Analysis failed (${res.status})`);
      }

      const result = (await res.json()) as { matches: MatchedSample[] };
      setMatches(result.matches || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  const filtered = filterGenre
    ? matches.filter((m) => m.genre === filterGenre)
    : matches;

  const genres = Array.from(new Set(matches.map((m) => m.genre)));

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-white/10 bg-[#0c0c12] p-4">
        <h3 className="text-sm font-bold text-white mb-3">🧲 Vibe Match Browser</h3>

        <button
          onClick={analyzeAndMatch}
          disabled={analyzing}
          className="w-full px-4 py-2 text-xs font-bold rounded bg-tube-300 text-black hover:bg-tube-200 disabled:opacity-50 mb-3"
        >
          {analyzing ? "Analyzing…" : "🔍 Find Similar Samples"}
        </button>

        {error && <div className="text-xs text-red-400 mb-3">{error}</div>}
      </div>

      {matches.length > 0 && (
        <div className="rounded-lg border border-white/10 bg-[#0c0c12] p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-white">
              Found {filtered.length} matches
            </h4>
            {genres.length > 0 && (
              <select
                value={filterGenre || ""}
                onChange={(e) => setFilterGenre(e.target.value || null)}
                className="text-[10px] rounded bg-white/5 border border-white/10 px-2 py-1 text-white"
              >
                <option value="">All Genres</option>
                {genres.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {filtered.map((sample) => (
              <div
                key={sample.id}
                className="flex items-center justify-between px-3 py-2 rounded bg-white/5 hover:bg-white/10 transition"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white truncate">
                    {sample.name}
                  </p>
                  <p className="text-[10px] text-white/50">
                    {sample.bpm} BPM • {sample.key} • {sample.genre}
                  </p>
                  <div className="mt-1 w-full bg-white/10 rounded-full h-1 overflow-hidden">
                    <div
                      className="h-full bg-tube-300"
                      style={{
                        width: `${(sample.similarityScore / 100) * 100}%`,
                      }}
                    />
                  </div>
                </div>
                <button
                  onClick={() => {
                    onSampleSelected?.(sample.id, sample.name);
                  }}
                  className="ml-2 px-2 py-1 text-[10px] rounded border border-white/20 text-white hover:bg-white/10"
                >
                  + Add
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
