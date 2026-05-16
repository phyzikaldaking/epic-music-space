"use client";

import { useState } from "react";

const MUSICAL_KEYS = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

export default function VocalKeyDetection({
  trackId,
  currentKey,
  onKeyDetected,
}: {
  trackId: string;
  currentKey: string;
  onKeyDetected?: (detectedKey: string) => void;
}) {
  const [detecting, setDetecting] = useState(false);
  const [detectedKey, setDetectedKey] = useState<string | null>(null);
  const [targetKey, setTargetKey] = useState(currentKey);
  const [transposing, setTransposing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function detectKey() {
    setDetecting(true);
    setError(null);

    try {
      const res = await fetch("/api/studio/vocal/detect-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as unknown;
        throw new Error(data.error || `Detection failed (${res.status})`);
      }

      const result = (await res.json()) as { detectedKey: string; confidence: number };
      setDetectedKey(result.detectedKey);
      setTargetKey(result.detectedKey);
      onKeyDetected?.(result.detectedKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Detection failed");
    } finally {
      setDetecting(false);
    }
  }

  async function transposeProject() {
    if (targetKey === currentKey) {
      setError("Already in target key");
      return;
    }

    setTransposing(true);
    setError(null);

    try {
      const res = await fetch("/api/studio/vocal/transpose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackId,
          fromKey: currentKey,
          toKey: targetKey,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as unknown;
        throw new Error(data.error || `Transpose failed (${res.status})`);
      }

      // Update UI to reflect new key
      // In real implementation, this would update the project state
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transpose failed");
    } finally {
      setTransposing(false);
    }
  }

  const semitoneShift = MUSICAL_KEYS.indexOf(targetKey) - MUSICAL_KEYS.indexOf(currentKey);

  return (
    <div className="space-y-3 rounded-lg border border-white/10 bg-[#0c0c12] p-4">
      <h3 className="text-sm font-bold text-white">🎹 Vocal Key Detection</h3>

      {/* Detect Key */}
      <button
        onClick={detectKey}
        disabled={detecting}
        className="w-full px-4 py-2 text-xs font-bold rounded bg-tube-300 text-black hover:bg-tube-200 disabled:opacity-50"
      >
        {detecting ? "Detecting…" : "🔍 Detect Vocal Key"}
      </button>

      {error && <div className="text-xs text-red-400">{error}</div>}

      {detectedKey && (
        <div className="space-y-2 rounded bg-white/5 p-2">
          <div>
            <p className="text-xs text-white/60 mb-1">Detected Key</p>
            <p className="text-sm font-bold text-tube-300">{detectedKey}</p>
          </div>

          {/* Transpose to Different Key */}
          <div>
            <p className="text-xs text-white/60 mb-1">Transpose To</p>
            <select
              value={targetKey}
              onChange={(e) => setTargetKey(e.target.value)}
              disabled={transposing}
              className="w-full text-xs rounded bg-white/5 border border-white/10 px-2 py-1 text-white"
            >
              {MUSICAL_KEYS.map((key) => (
                <option key={key} value={key}>
                  {key} {semitoneShift !== 0 && `(${semitoneShift > 0 ? "+" : ""}${semitoneShift})`}
                </option>
              ))}
            </select>
          </div>

          {targetKey !== currentKey && (
            <button
              onClick={transposeProject}
              disabled={transposing}
              className="w-full px-3 py-2 text-xs font-bold rounded bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-50"
            >
              {transposing ? "Transposing…" : "🔄 Transpose Project"}
            </button>
          )}
        </div>
      )}

      <p className="text-[10px] text-white/50">
        Detects vocal pitch center and transposes all tracks to a new key automatically.
      </p>
    </div>
  );
}
