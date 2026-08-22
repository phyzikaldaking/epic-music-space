"use client";

import type { StudioClip, StudioRecentProject, StudioSnapshot } from "../types";

export function FilesWorkspace({
  recent,
  openSession,
  snapshots,
  revertSnapshot,
  snapshot,
  sessionId,
  title,
  bpm,
  sampleRate,
  missingClips,
  offline,
  lockWarning,
}: {
  recent: StudioRecentProject[];
  openSession: (id: string) => void;
  snapshots: StudioSnapshot[];
  revertSnapshot: (id: string) => void;
  snapshot: () => void;
  sessionId: string;
  title: string;
  bpm: number;
  sampleRate: number;
  missingClips: StudioClip[];
  offline: boolean;
  lockWarning: string | null;
}) {
  return (
    <div className="platinum-library">
      <aside className="platinum-library__aside">
        <span className="platinum-eyebrow">SESSION VAULT</span>
        <h2>Cloud Files</h2>
        <div className="mt-4 space-y-2 text-xs uppercase tracking-widest text-white/45">
          <p>Session: <b className="text-white/80">{title}</b></p>
          <p>ID: <b className="text-white/80">{sessionId}</b></p>
          <p>BPM: <b className="text-white/80">{bpm}</b></p>
          <p>Sample Rate: <b className="text-white/80">{sampleRate}</b></p>
          <p>Missing Clips: <b className="text-white/80">{missingClips.length}</b></p>
          {offline && <p className="text-yellow-300">Offline: cloud sync paused.</p>}
          {lockWarning && <p className="text-yellow-300">{lockWarning}</p>}
        </div>
        <button onClick={snapshot} className="platinum-primary">
          Create Snapshot
        </button>
      </aside>

      <main className="platinum-library__main platinum-library__grid">
        <section className="platinum-card">
          <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-white/50">Cloud Projects</h3>
          {recent.length === 0 ? (
            <div className="platinum-empty">No cloud projects yet. Save once to create one.</div>
          ) : (
            <div className="space-y-2">
              {recent.map((item) => (
                <button
                  key={item.id}
                  onClick={() => openSession(item.id)}
                  className="platinum-project"
                >
                  <b className="block truncate uppercase text-cyan-100">{item.title}</b>
                  <span className="text-xs text-white/40">{new Date(item.updatedAt).toLocaleString()}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="platinum-card">
          <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-white/50">Snapshots</h3>
          {snapshots.length === 0 ? (
            <div className="platinum-empty">No snapshots yet.</div>
          ) : (
            <div className="space-y-2">
              {snapshots.map((item) => (
                <button
                  key={item.id}
                  onClick={() => revertSnapshot(item.id)}
                  className="platinum-project"
                >
                  <b className="block truncate uppercase text-green-200">{item.label}</b>
                  <span className="text-xs text-white/40">{new Date(item.createdAt).toLocaleString()}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
