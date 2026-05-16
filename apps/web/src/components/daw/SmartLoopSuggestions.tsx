"use client";

import { useState } from "react";

interface SmartLoop {
  id: string;
  name: string;
  duration: number;
  compatibility: number; // 0-100 match score
  reason: string;
}

export default function SmartLoopSuggestions({
  projectKey,
  projectBpm,
  onSelectLoop,
}: {
  projectKey: string;
  projectBpm: number;
  onSelectLoop?: (id: string, name: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<SmartLoop[]>([]);
  const [loading, setLoading] = useState(false);

  async function fetchSuggestions() {
    setLoading(true);
    try {
      const res = await fetch("/api/studio/loops/smart-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: projectKey, bpm: projectBpm }),
      });
      if (!res.ok) throw new Error("Fetch failed");
      const data = (await res.json()) as { suggestions: SmartLoop[] };
      setSuggestions(data.suggestions || []);
    } catch (err) {
      console.error("Failed to fetch suggestions:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-white/10 bg-[#0c0c12] p-4">
      <h3 className="text-sm font-bold text-white mb-3">Smart Loop Suggestions</h3>

      <button
        onClick={fetchSuggestions}
        disabled={loading}
        className="w-full px-4 py-2 text-xs font-bold rounded bg-tube-300 text-black hover:bg-tube-200 disabled:opacity-50 mb-3"
      >
        {loading ? "Analyzing..." : "Find Matching Loops"}
      </button>

      {suggestions.length > 0 && (
        <div className="space-y-2">
          {suggestions.map((loop) => (
            <div key={loop.id} className="rounded bg-white/5 p-2">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-bold text-white">{loop.name}</p>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-tube-300 text-black">
                  {loop.compatibility}%
                </span>
              </div>
              <p className="text-[10px] text-white/60 mb-1">{loop.reason}</p>
              <button
                onClick={() => onSelectLoop?.(loop.id, loop.name)}
                className="text-[10px] px-2 py-1 rounded border border-white/20 text-white hover:bg-white/10"
              >
                + Add
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
