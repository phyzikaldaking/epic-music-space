"use client";

import type { StudioTrack } from "../types";
import { clipFileExtension } from "../audio";
import { FinishReview } from "./FinishReview";

export function ExportWorkspace({
  tracks,
  selected,
  downloadClip,
  exportArchive,
  projectId,
  title,
  updatedAt,
  saved,
}: {
  tracks: StudioTrack[];
  selected: StudioTrack | null;
  downloadClip: (track: StudioTrack, clip: StudioTrack["clips"][number]) => void;
  exportArchive: () => void;
  projectId: string;
  title: string;
  updatedAt: string;
  saved: boolean;
}) {
  const clipCount = tracks.reduce((sum, track) => sum + track.clips.length, 0);

  return (
    <div className="platinum-library">
      <aside className="platinum-library__aside">
        <span className="platinum-eyebrow">MASTER DELIVERY</span>
        <h2>
          Export Room
        </h2>

        <div className="mt-4 space-y-2 text-xs uppercase tracking-widest text-white/45">
          <p>Tracks: <b className="text-white/80">{tracks.length}</b></p>
          <p>Clips: <b className="text-white/80">{clipCount}</b></p>
          <p>Selected: <b className="text-white/80">{selected?.name ?? "none"}</b></p>
        </div>

        <div className="platinum-note">Delivery always opens a final review. Public, Marketplace, Room, and Battle actions never happen automatically.</div>
      </aside>

      <main className="platinum-library__main">
        <FinishReview project={{ id:projectId, title, updatedAt, tracks:tracks.length }} missingMedia={tracks.flatMap((track) => track.clips).filter((clip) => clip.missing || !clip.url).length} clipping={tracks.some((track) => track.volume + track.inputGain >= 154)} saved={saved} onDownload={exportArchive} />
        <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-white/50">
          Source Audio
        </h3>

        <div className="space-y-4">
          {tracks.map((track) => (
            <section key={track.id} className="platinum-card">
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
                      className="platinum-row"
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
