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
    <div className="grid h-full grid-cols-[320px_1fr] bg-[#171a1f] text-sm text-white/70">
      <aside className="border-r border-black bg-[#20242b] p-4">
        <h2 className="text-lg font-black uppercase tracking-widest text-cyan-100">Files</h2>
        <div className="mt-4 space-y-2 text-xs uppercase tracking-widest text-white/45">
          <p>Session: <b className="text-white/80">{title}</b></p>
          <p>ID: <b className="text-white/80">{sessionId}</b></p>
          <p>BPM: <b className="text-white/80">{bpm}</b></p>
          <p>Sample Rate: <b className="text-white/80">{sampleRate}</b></p>
          <p>Missing Clips: <b className="text-white/80">{missingClips.length}</b></p>
          {offline && <p className="text-yellow-300">Offline: cloud sync paused.</p>}
          {lockWarning && <p className="text-yellow-300">{lockWarning}</p>}
        </div>
        <button onClick={snapshot} className="mt-5 w-full bg-cyan-300 px-4 py-2 text-xs font-black uppercase text-black">
          Create Snapshot
        </button>
      </aside>

      <main className="grid min-h-0 grid-cols-2 gap-4 overflow-auto p-4">
        <section>
          <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-white/50">Cloud Projects</h3>
          {recent.length === 0 ? (
            <div className="border border-black bg-black/25 p-4 text-white/45">No cloud projects yet. Save once to create one.</div>
          ) : (
            <div className="space-y-2">
              {recent.map((item) => (
                <button
                  key={item.id}
                  onClick={() => openSession(item.id)}
                  className="block w-full border border-black bg-[#30343b] p-3 text-left hover:bg-[#3b404a]"
                >
                  <b className="block truncate uppercase text-cyan-100">{item.title}</b>
                  <span className="text-xs text-white/40">{new Date(item.updatedAt).toLocaleString()}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-white/50">Snapshots</h3>
          {snapshots.length === 0 ? (
            <div className="border border-black bg-black/25 p-4 text-white/45">No snapshots yet.</div>
          ) : (
            <div className="space-y-2">
              {snapshots.map((item) => (
                <button
                  key={item.id}
                  onClick={() => revertSnapshot(item.id)}
                  className="block w-full border border-black bg-[#30343b] p-3 text-left hover:bg-[#3b404a]"
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
