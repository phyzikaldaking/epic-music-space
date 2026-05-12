"use client";

import { useState, useEffect } from "react";

interface BattleSession {
  id: string;
  sampleId: string;
  sampleName: string;
  durationSeconds: number;
  createdAt: Date;
}

interface BattleEntry {
  sessionId: string;
  producerId: string;
  producerName: string;
  wavBlobUrl: string;
  submittedAt: Date;
  duration: number;
}

interface BattleLeaderboard {
  entries: Array<BattleEntry & { votes: number; rank: number }>;
  totalVotes: number;
}

export default function ProducerBattleMode({
  onStartBattle,
}: {
  onStartBattle?: (sampleId: string) => void;
}) {
  const [battles, setBattles] = useState<BattleSession[]>([]);
  const [selectedBattle, setSelectedBattle] = useState<BattleSession | null>(null);
  const [leaderboard, setLeaderboard] = useState<BattleLeaderboard | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(180); // 3 minutes
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isActive || timeRemaining <= 0) return;
    const interval = setInterval(() => {
      setTimeRemaining((t) => Math.max(0, t - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [isActive, timeRemaining]);

  async function createBattle(sampleId: string, sampleName: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/studio/battles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sampleId,
          sampleName,
          durationSeconds: 180,
        }),
      });
      if (!res.ok) throw new Error("Failed to create battle");
      const battle = (await res.json()) as BattleSession;
      setBattles((prev) => [battle, ...prev]);
      setSelectedBattle(battle);
      setTimeRemaining(180);
      setIsActive(true);
      onStartBattle?.(sampleId);
    } catch (err) {
      console.error("Battle creation failed:", err);
    } finally {
      setLoading(false);
    }
  }

  async function submitEntry(wavBlob: Blob) {
    if (!selectedBattle) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("audio", wavBlob);
      fd.append("sessionId", selectedBattle.id);
      const res = await fetch("/api/studio/battles/submit", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error("Submit failed");
      setIsActive(false);
      await loadLeaderboard(selectedBattle.id);
    } catch (err) {
      console.error("Submit failed:", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadLeaderboard(battleId: string) {
    try {
      const res = await fetch(`/api/studio/battles/${battleId}/leaderboard`);
      if (!res.ok) throw new Error("Failed to load leaderboard");
      const lb = (await res.json()) as BattleLeaderboard;
      setLeaderboard(lb);
    } catch (err) {
      console.error("Leaderboard load failed:", err);
    }
  }

  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;

  return (
    <div className="space-y-4">
      {/* Battle Selector */}
      <div className="rounded-lg border border-white/10 bg-[#0c0c12] p-4">
        <h3 className="text-sm font-bold text-white mb-3">🎤 Producer Battle</h3>

        {!isActive && !selectedBattle && (
          <div className="space-y-2">
            <button
              onClick={() => createBattle("sample-001", "Trap Loop")}
              disabled={loading}
              className="w-full px-4 py-2 text-xs font-bold rounded bg-tube-300 text-black hover:bg-tube-200 disabled:opacity-50"
            >
              {loading ? "Starting…" : "Start Battle with Trap Loop"}
            </button>
          </div>
        )}

        {isActive && selectedBattle && (
          <div className="space-y-3">
            <div className="text-center">
              <p className="text-xs text-white/60 mb-1">Time Remaining</p>
              <p className="text-3xl font-black text-tube-300">
                {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
              </p>
            </div>
            <p className="text-xs text-white/60 text-center">
              Battle: {selectedBattle.sampleName}
            </p>
            <button
              onClick={() => {
                // In real implementation, export current mix and submit
                const mockWav = new Blob(["audio data"], { type: "audio/wav" });
                submitEntry(mockWav);
              }}
              disabled={loading}
              className="w-full px-4 py-2 text-xs font-bold rounded bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-50"
            >
              {loading ? "Submitting…" : "🏁 Submit Mix"}
            </button>
          </div>
        )}
      </div>

      {/* Leaderboard */}
      {leaderboard && (
        <div className="rounded-lg border border-white/10 bg-[#0c0c12] p-4">
          <h3 className="text-sm font-bold text-white mb-3">🏆 Leaderboard</h3>
          <div className="space-y-2">
            {leaderboard.entries.map((entry, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between px-3 py-2 rounded bg-white/5"
              >
                <div>
                  <p className="text-xs font-bold text-white">
                    #{entry.rank} {entry.producerName}
                  </p>
                  <p className="text-[10px] text-white/50">
                    {entry.votes} votes
                  </p>
                </div>
                <button
                  onClick={() => {
                    // Play audio preview
                  }}
                  className="px-3 py-1 text-[10px] rounded border border-white/20 text-white hover:bg-white/10"
                >
                  ▶ Play
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 text-xs text-white/60">
            Total Votes: {leaderboard.totalVotes}
          </div>
        </div>
      )}
    </div>
  );
}
