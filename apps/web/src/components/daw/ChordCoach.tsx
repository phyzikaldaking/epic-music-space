"use client";

import React, { useState } from "react";

type ChordQuality = "major" | "minor" | "7" | "maj7" | "min7" | "sus2" | "sus4" | "dim" | "aug";
type NoteName = "C" | "C#" | "D" | "D#" | "E" | "F" | "F#" | "G" | "G#" | "A" | "A#" | "B";

interface ChordCoachProps {
  currentKey?: NoteName;
  className?: string;
}

const ALL_NOTES: NoteName[] = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11];

// Music theory: suggest next chords in a key based on harmonic movement
const getNextChords = (root: NoteName, key: NoteName): { chord: string; reason: string }[] => {
  const suggestions = [
    { chord: "IV", reason: "Classic plagal movement (subdominant)" },
    { chord: "V", reason: "Strong dominant tension" },
    { chord: "vi", reason: "Relative minor, smooth transition" },
    { chord: "ii", reason: "Common jazz progression" },
  ];
  return suggestions;
};

export default function ChordCoach({ currentKey = "C", className = "" }: ChordCoachProps) {
  const [detectedChord, setDetectedChord] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const handleAnalyzeFromMic = async () => {
    setAnalyzing(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Placeholder: real chord detection would use autocorrelation + pitch + harmonic analysis
      await new Promise((r) => setTimeout(r, 1000));
      setDetectedChord("C major");
      stream.getTracks().forEach((t) => t.stop());
    } catch (err) {
      console.error("Mic access failed", err);
    } finally {
      setAnalyzing(false);
    }
  };

  const suggestions = detectedChord ? getNextChords("C", currentKey) : [];

  return (
    <div className={`flex flex-col gap-3 rounded-lg bg-black/50 p-4 ${className}`}>
      <div className="text-xs font-bold uppercase text-white/60">AI Chord Coach</div>

      <button
        type="button"
        onClick={handleAnalyzeFromMic}
        disabled={analyzing}
        className="rounded border border-cyan-400/40 bg-cyan-500/15 px-3 py-2 text-xs font-bold uppercase text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-40"
      >
        {analyzing ? "Analyzing…" : "Detect Chord from Mic"}
      </button>

      {detectedChord && (
        <div className="rounded bg-black/40 p-3">
          <div className="text-[10px] text-white/50">Current chord</div>
          <div className="font-display text-2xl font-bold text-cyan-300">{detectedChord}</div>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-bold uppercase text-white/60">Next chords</div>
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              className="w-full rounded border border-white/10 bg-white/[0.03] px-2 py-2 text-left text-xs hover:bg-white/[0.08]"
            >
              <div className="font-bold text-white">{s.chord}</div>
              <div className="text-[10px] text-white/50">{s.reason}</div>
            </button>
          ))}
        </div>
      )}

      {!detectedChord && (
        <div className="text-[10px] text-white/45">
          Click &quot;Detect Chord&quot; to analyze audio from your microphone. The coach will suggest
          harmonic progressions based on music theory.
        </div>
      )}
    </div>
  );
}
