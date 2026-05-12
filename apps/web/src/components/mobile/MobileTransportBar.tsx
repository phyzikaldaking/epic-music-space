"use client";

import { useState, useEffect } from "react";

interface MobileTransportBarProps {
  isPlaying: boolean;
  bpm: number;
  onPlay: () => void;
  onStop: () => void;
  onTapTempo: () => void;
  onOpenCoach?: () => void;
  onRecord?: () => void;
}

export default function MobileTransportBar({
  isPlaying,
  bpm,
  onPlay,
  onStop,
  onTapTempo,
  onOpenCoach,
  onRecord,
}: MobileTransportBarProps) {
  const [tapTempo, setTapTempo] = useState(0);
  const [lastTapTime, setLastTapTime] = useState(0);

  function handleTapTempo() {
    const now = Date.now();
    const diff = now - lastTapTime;

    // Reset if more than 1 second since last tap
    if (diff > 1000) {
      setTapTempo(1);
      setLastTapTime(now);
    } else {
      // Calculate BPM from tap interval
      const tapCount = tapTempo + 1;
      if (tapCount >= 2) {
        const avgBpm = Math.round((60000 * (tapCount - 1)) / (now - lastTapTime + diff));
        if (avgBpm >= 60 && avgBpm <= 240) {
          // Reasonable BPM range
          onTapTempo?.();
        }
      }
      setTapTempo(tapCount);
      setLastTapTime(now);
    }
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-gradient-to-t from-[#0a0a12] via-[#0c0c14] to-transparent p-3"
      style={{
        paddingBottom: "calc(0.75rem + max(0px, env(safe-area-inset-bottom)))",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        {/* Record Button */}
        <button
          onClick={onRecord}
          className="flex-1 rounded-lg px-3 py-2 text-xs font-bold bg-red-500 text-white hover:bg-red-600 transition"
          title="Record"
        >
          ⏺️ Rec
        </button>

        {/* Play/Stop */}
        <button
          onClick={isPlaying ? onStop : onPlay}
          className="flex-1 rounded-lg px-3 py-2 text-xs font-bold bg-tube-300 text-black hover:bg-tube-200 transition"
          title={isPlaying ? "Stop" : "Play"}
        >
          {isPlaying ? "⏹️ Stop" : "▶️ Play"}
        </button>

        {/* BPM Display + Tap Tempo */}
        <button
          onClick={handleTapTempo}
          className="flex-1 flex flex-col items-center justify-center rounded-lg border border-white/20 px-3 py-2 text-xs font-bold text-white hover:bg-white/10 transition"
          title="Tap to set tempo"
        >
          <span className="text-[10px] opacity-70">BPM</span>
          <span className="text-sm">{bpm}</span>
        </button>

        {/* Coach Button */}
        {onOpenCoach && (
          <button
            onClick={onOpenCoach}
            className="flex-1 rounded-lg px-3 py-2 text-xs font-bold border border-amber-400/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20 transition"
            title="Open AI Coach"
          >
            🤖 Coach
          </button>
        )}
      </div>

      <div className="mt-2 text-[10px] text-white/40 text-center">
        {tapTempo > 0 && (
          <span>Tap tempo: {tapTempo} tap{tapTempo !== 1 ? "s" : ""}</span>
        )}
      </div>
    </div>
  );
}
