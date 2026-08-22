"use client";

import type { StudioClip, StudioTrack } from "../types";
import { normalizeClip } from "../editing";

export function Inspector({
  track,
  clip,
  tracks,
  updateTrack,
  updateClip,
  arm,
  splitAtPlayhead,
  duplicateClip,
  deleteSelectedClip,
  renameClip,
  copyClip,
  cutClip,
  pasteClip,
  nudgeLeft,
  nudgeRight,
  trimLeft,
  trimRight,
  moveClipToTrack,
}: {
  track: StudioTrack | null;
  clip: StudioClip | null;
  tracks: StudioTrack[];
  updateTrack: (id: string, patch: Partial<StudioTrack>, label?: string) => void;
  updateClip: (id: string, patch: Partial<StudioClip>, label?: string) => void;
  arm: (id: string) => void;
  splitAtPlayhead: () => void;
  duplicateClip: () => void;
  deleteSelectedClip: () => void;
  renameClip: () => void;
  copyClip: () => void;
  cutClip: () => void;
  pasteClip: () => void;
  nudgeLeft: () => void;
  nudgeRight: () => void;
  trimLeft: (amount: number) => void;
  trimRight: (amount: number) => void;
  moveClipToTrack: (id: string) => void;
}) {
  if (!track) {
    return (
      <div className="border-t border-black bg-[#20242b] p-3 text-xs text-white/45">
        Load audio to inspect track data.
      </div>
    );
  }

  const clipping = track.volume + track.inputGain >= 154;

  return (
    <div className="overflow-auto border-t border-black bg-[#20242b] p-3 text-xs">
      <b className="block truncate uppercase" style={{ color: track.color }}>
        {track.name}
      </b>
      <span className="mt-1 block truncate text-white/40">
        {clip?.name ?? "No clip selected"}
      </span>

      <div className="mt-2 grid grid-cols-3 gap-1 text-[9px] font-black uppercase">
        <button
          onClick={() => updateTrack(track.id, { muted: !track.muted }, "Toggle mute")}
          className={track.muted ? "bg-yellow-300 py-1 text-black" : "bg-[#111] py-1 text-white/55"}
        >
          Mute
        </button>
        <button
          onClick={() => updateTrack(track.id, { solo: !track.solo }, "Toggle solo")}
          className={track.solo ? "bg-cyan-300 py-1 text-black" : "bg-[#111] py-1 text-white/55"}
        >
          Solo
        </button>
        <button
          onClick={() => arm(track.id)}
          className={track.armed ? "bg-red-500 py-1 text-black" : "bg-[#111] py-1 text-white/55"}
        >
          Arm
        </button>
      </div>

      <label className="mt-2 block uppercase text-white/40">
        Vol {track.volume}
        <input
          type="range"
          min="0"
          max="100"
          value={track.volume}
          onChange={(event) => updateTrack(track.id, { volume: Number(event.target.value) }, "Set track volume")}
          className="w-full accent-cyan-300"
        />
      </label>

      <label className="mt-2 block uppercase text-white/40">
        Pan {track.pan}
        <input
          type="range"
          min="-100"
          max="100"
          value={track.pan}
          onChange={(event) => updateTrack(track.id, { pan: Number(event.target.value) }, "Set track pan")}
          className="w-full accent-purple-300"
        />
      </label>

      <label className="mt-2 block uppercase text-white/40">
        Input {track.inputGain}
        <input
          type="range"
          min="0"
          max="100"
          value={track.inputGain}
          onChange={(event) => updateTrack(track.id, { inputGain: Number(event.target.value) }, "Set input gain")}
          className="w-full accent-green-300"
        />
      </label>

      {clipping && (
        <button
          onClick={() => updateTrack(track.id, { volume: 72, inputGain: 62 }, "Fix clipping")}
          className="mt-2 w-full bg-red-500 py-2 font-black uppercase text-black"
        >
          Fix clipping
        </button>
      )}

      {clip && (
        <div className="mt-3 border-t border-black pt-3">
          <div className="grid grid-cols-2 gap-1 text-[9px] font-black uppercase">
            <button onClick={splitAtPlayhead} className="bg-[#111] py-1 text-white/55">Separate</button>
            <button onClick={duplicateClip} className="bg-[#111] py-1 text-white/55">Duplicate</button>
            <button onClick={renameClip} className="bg-[#111] py-1 text-white/55">Rename</button>
            <button onClick={deleteSelectedClip} className="bg-red-500 py-1 text-black">Delete</button>
            <button onClick={nudgeLeft} className="bg-[#111] py-1 text-white/55">Nudge -</button>
            <button onClick={nudgeRight} className="bg-[#111] py-1 text-white/55">Nudge +</button>
            <button onClick={() => trimLeft(0.05)} className="bg-[#111] py-1 text-white/55">Trim L +</button>
            <button onClick={() => trimRight(0.05)} className="bg-[#111] py-1 text-white/55">Trim R +</button>
            <button onClick={copyClip} className="bg-[#111] py-1 text-white/55">Copy</button>
            <button onClick={cutClip} className="bg-[#111] py-1 text-white/55">Cut</button>
            <button onClick={pasteClip} className="bg-[#111] py-1 text-white/55">Paste</button>
            <button
              onClick={() => updateClip(clip.id, { locked: !clip.locked }, "Toggle clip lock")}
              className={clip.locked ? "bg-red-500 py-1 text-black" : "bg-[#111] py-1 text-white/55"}
            >
              Lock
            </button>
            <button
              onClick={() => updateClip(clip.id, { muted: !clip.muted }, "Toggle clip mute")}
              className={clip.muted ? "bg-yellow-300 py-1 text-black" : "bg-[#111] py-1 text-white/55"}
            >
              Clip Mute
            </button>
            <button onClick={() => updateClip(clip.id, normalizeClip(clip, -1), "Normalize clip")} className="bg-[#111] py-1 text-white/55">Normalize</button>
            <button onClick={() => updateClip(clip.id, { reversed: !clip.reversed }, "Toggle reverse")} className={clip.reversed ? "bg-purple-400 py-1 text-black" : "bg-[#111] py-1 text-white/55"}>Reverse</button>
          </div>

          <label className="mt-2 block uppercase text-white/40">
            Gain {clip.gain} dB
            <input
              type="range"
              min="-24"
              max="24"
              value={clip.gain}
              onChange={(event) => updateClip(clip.id, { gain: Number(event.target.value) }, "Set clip gain")}
              className="w-full accent-yellow-300"
            />
          </label>

          <label className="mt-2 block uppercase text-white/40">
            Fade in {clip.fadeIn.toFixed(2)}s
            <input type="range" min="0" max={Math.max(.1, clip.duration - clip.trimStart - clip.trimEnd)} step=".05" value={clip.fadeIn} onChange={(event) => updateClip(clip.id, { fadeIn:Number(event.target.value) }, "Set fade in")} className="w-full accent-cyan-300" />
          </label>
          <label className="mt-2 block uppercase text-white/40">
            Fade out {clip.fadeOut.toFixed(2)}s
            <input type="range" min="0" max={Math.max(.1, clip.duration - clip.trimStart - clip.trimEnd)} step=".05" value={clip.fadeOut} onChange={(event) => updateClip(clip.id, { fadeOut:Number(event.target.value) }, "Set fade out")} className="w-full accent-purple-300" />
          </label>
          <label className="mt-2 block uppercase text-white/40">
            Speed {(clip.playbackRate ?? 1).toFixed(2)}×
            <input type="range" min=".25" max="4" step=".05" value={clip.playbackRate ?? 1} onChange={(event) => updateClip(clip.id, { playbackRate:Number(event.target.value) }, "Stretch clip")} className="w-full accent-green-300" />
          </label>
          <label className="mt-2 block uppercase text-white/40">
            Pitch {clip.pitchSemitones ?? 0} semitones
            <input type="range" min="-24" max="24" step="1" value={clip.pitchSemitones ?? 0} onChange={(event) => updateClip(clip.id, { pitchSemitones:Number(event.target.value) }, "Shift clip pitch")} className="w-full accent-yellow-300" />
          </label>

          <label className="mt-2 block uppercase text-white/40">
            Move to track
            <select
              value={track.id}
              onChange={(event) => moveClipToTrack(event.target.value)}
              className="mt-1 w-full bg-black px-2 py-1 text-green-300"
            >
              {tracks.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
