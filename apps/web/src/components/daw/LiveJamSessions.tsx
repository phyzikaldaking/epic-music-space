"use client";

import { useState, useEffect } from "react";

interface JamSession {
  id: string;
  name: string;
  participants: Array<{
    id: string;
    name: string;
    isPlaying: boolean;
    lastBeatTime: number;
  }>;
  projectId: string;
  isLive: boolean;
  createdAt: Date;
}

export default function LiveJamSessions({
  projectId,
  userId,
  userName,
  onSessionJoined,
}: {
  projectId: string;
  userId: string;
  userName: string;
  onSessionJoined?: (sessionId: string) => void;
}) {
  const [sessions, setSessions] = useState<JamSession[]>([]);
  const [currentSession, setCurrentSession] = useState<JamSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createJamSession() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/studio/jam/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          sessionName: `Jam with ${userName}`,
        }),
      });

      if (!res.ok) throw new Error("Failed to create session");

      const session = (await res.json()) as JamSession;
      setCurrentSession(session);
      onSessionJoined?.(session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
    } finally {
      setLoading(false);
    }
  }

  async function joinJamSession(sessionId: string) {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/studio/jam/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          userId,
          userName,
        }),
      });

      if (!res.ok) throw new Error("Failed to join session");

      const session = (await res.json()) as JamSession;
      setCurrentSession(session);
      onSessionJoined?.(session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join session");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-white/10 bg-[#0c0c12] p-4">
      <h3 className="text-sm font-bold text-white">🎵 Live Jam Sessions</h3>

      {!currentSession ? (
        <>
          <button
            onClick={createJamSession}
            disabled={loading}
            className="w-full px-4 py-2 text-xs font-bold rounded bg-tube-300 text-black hover:bg-tube-200 disabled:opacity-50"
          >
            {loading ? "Creating…" : "🚀 Start Jam Session"}
          </button>

          {error && <div className="text-xs text-red-400">{error}</div>}

          <p className="text-[10px] text-white/50">
            Jam with friends in real-time. Everyone controls the beat together.
          </p>
        </>
      ) : (
        <div className="space-y-2 rounded bg-white/5 p-2">
          <p className="text-xs font-bold text-white">{currentSession.name}</p>

          <div className="space-y-1">
            {currentSession.participants.map((participant) => (
              <div
                key={participant.id}
                className="flex items-center justify-between text-[10px] text-white/70"
              >
                <span>{participant.name}</span>
                <span>
                  {participant.isPlaying ? "▶️" : "⏸️"} Last:{" "}
                  {Math.round((Date.now() - participant.lastBeatTime) / 100) / 10}s ago
                </span>
              </div>
            ))}
          </div>

          <button
            onClick={() => setCurrentSession(null)}
            className="w-full mt-2 px-3 py-1 text-[10px] rounded border border-white/20 text-white hover:bg-white/10"
          >
            Leave Session
          </button>
        </div>
      )}
    </div>
  );
}
