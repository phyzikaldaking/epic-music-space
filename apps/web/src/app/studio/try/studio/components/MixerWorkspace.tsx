"use client";

import type { StudioTrack } from "../types";

export function MixerWorkspace({
  tracks,
  selected,
  update,
  arm,
}: {
  tracks: StudioTrack[];
  selected: StudioTrack | null;
  update: (id: string, patch: Partial<StudioTrack>, label?: string) => void;
  arm: (id: string) => void;
}) {
  return (
    <div className="flex h-full overflow-auto bg-[#16191e] p-4">
      <div className="flex gap-3">
        {tracks.map((track) => {
          const clipping = track.volume + track.inputGain >= 154;
          const active = selected?.id === track.id;

          return (
            <div
              key={track.id}
              className={active ? "w-40 border border-cyan-300 bg-[#232830] p-3" : "w-40 border border-black bg-[#232830] p-3"}
            >
              <div className="mb-2 flex items-center justify-between">
                <b className="truncate text-xs uppercase tracking-widest" style={{ color: track.color }}>
                  {track.name}
                </b>
                <button
                  onClick={() => arm(track.id)}
                  className={track.armed ? "bg-red-500 px-2 py-1 text-[9px] font-black uppercase text-black" : "bg-[#111] px-2 py-1 text-[9px] font-black uppercase text-white/55"}
                >
                  Arm
                </button>
              </div>

              <div className="mb-3 flex justify-center">
                <div className="relative flex h-52 w-12 items-end rounded bg-black/40 p-1">
                  <div
                    className="w-full rounded-t bg-cyan-300"
                    style={{ height: `${Math.max(4, track.volume)}%` }}
                  />
                </div>
              </div>

              <label className="block text-[10px] uppercase tracking-widest text-white/45">
                Volume {track.volume}
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={track.volume}
                  onChange={(event) => update(track.id, { volume: Number(event.target.value) }, "Mixer volume")}
                  className="w-full accent-cyan-300"
                />
              </label>

              <label className="mt-2 block text-[10px] uppercase tracking-widest text-white/45">
                Pan {track.pan}
                <input
                  type="range"
                  min="-100"
                  max="100"
                  value={track.pan}
                  onChange={(event) => update(track.id, { pan: Number(event.target.value) }, "Mixer pan")}
                  className="w-full accent-purple-300"
                />
              </label>

              <label className="mt-2 block text-[10px] uppercase tracking-widest text-white/45">
                Input {track.inputGain}
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={track.inputGain}
                  onChange={(event) => update(track.id, { inputGain: Number(event.target.value) }, "Mixer input")}
                  className="w-full accent-green-300"
                />
              </label>

              <div className="mt-3 grid grid-cols-2 gap-1 text-[9px] font-black uppercase">
                <button
                  onClick={() => update(track.id, { muted: !track.muted }, "Toggle mute")}
                  className={track.muted ? "bg-yellow-300 py-1 text-black" : "bg-[#111] py-1 text-white/55"}
                >
                  Mute
                </button>
                <button
                  onClick={() => update(track.id, { solo: !track.solo }, "Toggle solo")}
                  className={track.solo ? "bg-cyan-300 py-1 text-black" : "bg-[#111] py-1 text-white/55"}
                >
                  Solo
                </button>
              </div>

              {clipping && (
                <div className="mt-3 bg-red-500 px-2 py-1 text-center text-[10px] font-black uppercase text-black">
                  Clipping
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
