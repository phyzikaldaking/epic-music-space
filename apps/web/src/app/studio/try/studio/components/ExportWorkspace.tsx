"use client";

import type { StudioTrack } from "../types";
import { clipFileExtension } from "../audio";

export function ExportWorkspace({
  tracks,
  selected,
  downloadClip,
  exportArchive,
}: {
  tracks: StudioTrack[];
  selected: StudioTrack | null;
  downloadClip: (track: StudioTrack, clip: StudioTrack["clips"][number]) => void;
  exportArchive: () => void;
}) {
  const clipCount = tracks.reduce((sum, track) => sum + track.clips.length, 0);

  return (
    <div className="grid h-full grid-cols-[320px_1fr] bg-[#15181d] text-white/70">
      <aside className="border-r border-black bg-[#20242b] p-4">
        <h2 className="text-lg font-black uppercase tracking-widest text-cyan-100">
          Export
        </h2>

        <div className="mt-4 space-y-2 text-xs uppercase tracking-widest text-white/45">
          <p>Tracks: <b className="text-white/80">{tracks.length}</b></p>
          <p>Clips: <b className="text-white/80">{clipCount}</b></p>
          <p>Selected: <b className="text-white/80">{selected?.name ?? "none"}</b></p>
        </div>

        <button
          onClick={exportArchive}
          className="mt-5 w-full bg-cyan-300 px-4 py-2 text-xs font-black uppercase text-black"
        >
          Export Session Archive
        </button>

        <div className="mt-5 border border-black bg-black/25 p-3 text-xs text-white/50">
          WAV mixdown and queued MP3 export worker integration are still pending.
        </div>
      </aside>

      <main className="overflow-auto p-4">
        <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-white/50">
          Source Audio
        </h3>

        <div className="space-y-4">
          {tracks.map((track) => (
            <section key={track.id} className="border border-black bg-[#232830] p-3">
              <b
                className="mb-3 block text-xs uppercase tracking-widest"
                style={{ color: track.color }}
              >
                {track.name}
              </b>

              {track.clips.length === 0 ? (
                <div className="text-xs text-white/40">No clips on this track.</div>
              ) : (
                <div className="space-y-2">
                  {track.clips.map((clip) => (
                    <div
                      key={clip.id}
                      className="flex items-center justify-between border border-black bg-black/20 px-3 py-2"
                    >
                      <div>
                        <b className="block text-xs uppercase text-white/80">
                          {clip.name}
                        </b>
                        <span className="text-[10px] text-white/40">
                          {clip.duration.toFixed(2)}s · .{clipFileExtension(clip)}
                        </span>
                      </div>

                      <button
                        onClick={() => downloadClip(track, clip)}
                        disabled={!clip.url}
                        className="bg-cyan-300 px-3 py-1 text-[10px] font-black uppercase text-black disabled:opacity-40"
                      >
                        Download
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
