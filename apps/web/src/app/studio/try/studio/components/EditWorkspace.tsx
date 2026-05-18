"use client";

import { useMemo } from "react";
import type { StudioClip, StudioTool, StudioTrack } from "../types";
import { formatTimelineTime, visibleClipDuration } from "../timeline";
import { Wave } from "./Wave";
import { Inspector } from "./Inspector";
import { RegionPanel } from "./RegionPanel";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function EditWorkspace({
  tracks,
  selectedTrack,
  selectedClip,
  selectedClipId,
  setSelectedTrackId,
  setSelectedClipId,
  importFiles,
  relinkClip,
  updateTrack,
  updateClip,
  arm,
  tool,
  zoom,
  playhead,
  setPlayhead,
  sessionEnd,
  selectionStart,
  selectionEnd,
  setSelectionStart,
  setSelectionEnd,
  loop,
  setLoop,
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
  editLog,
}: {
  tracks: StudioTrack[];
  selectedTrack: StudioTrack | null;
  selectedClip: StudioClip | null;
  selectedClipId: string | null;
  setSelectedTrackId: (id: string) => void;
  setSelectedClipId: (id: string) => void;
  importFiles: (files: FileList | File[]) => Promise<void>;
  relinkClip: (clipId: string, file: File) => Promise<void>;
  updateTrack: (id: string, patch: Partial<StudioTrack>, label?: string) => void;
  updateClip: (id: string, patch: Partial<StudioClip>, label?: string) => void;
  arm: (id: string) => void;
  tool: StudioTool;
  zoom: number;
  playhead: number;
  setPlayhead: (seconds: number) => void;
  sessionEnd: number;
  selectionStart: number;
  selectionEnd: number;
  setSelectionStart: (seconds: number) => void;
  setSelectionEnd: (seconds: number) => void;
  loop: boolean;
  setLoop: (value: boolean) => void;
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
  editLog: string[];
}) {
  const seconds = useMemo(() => Array.from({ length: Math.ceil(sessionEnd) + 1 }, (_, i) => i), [sessionEnd]);
  const timelineWidth = Math.max(1600, sessionEnd * zoom + 480);

  return (
    <div className="grid h-full min-h-0 grid-cols-[270px_1fr_260px] bg-[#1b1f26]">
      <div className="grid min-h-0 grid-rows-[42px_1fr_250px] border-r border-black bg-[#252930]">
        <div className="flex items-center border-b border-black bg-[#30343b] px-3 text-[10px] font-black uppercase tracking-widest text-white/55">
          Tracks
        </div>

        <div className="overflow-auto">
          {tracks.length === 0 && (
            <div className="px-3 py-4 text-xs leading-5 text-white/45">
              No tracks loaded.
            </div>
          )}

          {tracks.map((track) => (
            <button
              key={track.id}
              onClick={() => setSelectedTrackId(track.id)}
              className={cn(
                "grid min-h-[86px] w-full grid-cols-[8px_1fr_74px] border-b border-black text-left",
                selectedTrack?.id === track.id ? "bg-[#3a3d45]" : "bg-[#282c33]",
              )}
            >
              <span style={{ backgroundColor: track.color }} />
              <span className="min-w-0 px-3 py-2">
                <b className="block truncate text-[12px] uppercase text-white/85">{track.name}</b>
                <span className="mt-1 block text-[10px] uppercase tracking-wide text-white/40">
                  {track.clips.length} clip{track.clips.length === 1 ? "" : "s"}
                </span>
                <span className="mt-2 block h-2 bg-black">
                  <span className="block h-full bg-green-400" style={{ width: `${track.volume}%` }} />
                </span>
              </span>
              <span className="grid grid-cols-2 gap-px p-2 text-[9px] font-black uppercase">
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    updateTrack(track.id, { muted: !track.muted }, "Toggle mute");
                  }}
                  className={track.muted ? "bg-yellow-300 text-black" : "bg-[#15171b] text-white/45"}
                >
                  M
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    updateTrack(track.id, { solo: !track.solo }, "Toggle solo");
                  }}
                  className={track.solo ? "bg-cyan-300 text-black" : "bg-[#15171b] text-white/45"}
                >
                  S
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    arm(track.id);
                  }}
                  className={track.armed ? "col-span-2 bg-red-500 text-black" : "col-span-2 bg-[#15171b] text-white/45"}
                >
                  Rec
                </button>
              </span>
            </button>
          ))}
        </div>

        <Inspector
          track={selectedTrack}
          clip={selectedClip}
          tracks={tracks}
          updateTrack={updateTrack}
          updateClip={updateClip}
          arm={arm}
          splitAtPlayhead={splitAtPlayhead}
          duplicateClip={duplicateClip}
          deleteSelectedClip={deleteSelectedClip}
          renameClip={renameClip}
          copyClip={copyClip}
          cutClip={cutClip}
          pasteClip={pasteClip}
          nudgeLeft={nudgeLeft}
          nudgeRight={nudgeRight}
          trimLeft={trimLeft}
          trimRight={trimRight}
          moveClipToTrack={moveClipToTrack}
        />
      </div>

      <section
        className="grid min-h-0 grid-rows-[42px_1fr_58px] overflow-hidden bg-[#171a1f]"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void importFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <div className="relative overflow-hidden border-b border-black bg-[#30343b]" style={{ width: timelineWidth }}>
          <div className="absolute bottom-0 top-0 w-px bg-cyan-300" style={{ left: playhead * zoom }} />
          {seconds.map((second) => (
            <button
              key={second}
              onClick={() => setPlayhead(second)}
              className="absolute bottom-0 top-0 border-r border-black/80 px-1 text-left font-mono text-[10px] text-white/50"
              style={{ left: second * zoom, width: zoom }}
            >
              {second % 2 === 0 ? formatTimelineTime(second) : second}
            </button>
          ))}
        </div>

        {tracks.length === 0 ? (
          <div className="grid h-full place-items-center">
            <div className="text-center">
              <h2 className="text-2xl font-black uppercase tracking-widest text-cyan-100">Edit Window</h2>
              <p className="mt-3 text-sm text-white/50">Import, record, save, restore, relink, edit, mix, and export real audio.</p>
              <label className="mt-5 inline-block cursor-pointer bg-cyan-300 px-6 py-3 text-xs font-black uppercase text-black">
                Import Audio
                <input
                  type="file"
                  accept="audio/*,.wav,.wave,.mp3,.m4a,.aac,.ogg,.oga,.webm,.flac,.aif,.aiff,.mp4"
                  multiple
                  className="sr-only"
                  onChange={(event) => event.target.files && void importFiles(event.target.files)}
                />
              </label>
            </div>
          </div>
        ) : (
          <div className="overflow-auto">
            <div className="relative" style={{ width: timelineWidth }}>
              {tracks.map((track) => (
                <div key={track.id} className="relative h-[86px] border-b border-black bg-[#1b1f26]">
                  <div className="absolute inset-0">
                    {seconds.map((second) => (
                      <span key={second} className="absolute bottom-0 top-0 border-r border-black/70" style={{ left: second * zoom, width: zoom }} />
                    ))}
                  </div>
                  <div className="absolute bottom-0 top-0 bg-cyan-300/10" style={{ left: selectionStart * zoom, width: Math.max(1, (selectionEnd - selectionStart) * zoom) }} />
                  {track.armed && <div className="absolute inset-0 bg-red-500/[0.045]" />}
                  {track.clips.map((clip) => (
                    <button
                      key={clip.id}
                      onClick={() => {
                        setSelectedTrackId(track.id);
                        setSelectedClipId(clip.id);
                      }}
                      className={cn(
                        "absolute top-[10px] h-[66px] border px-3 text-left shadow-inner",
                        selectedClipId === clip.id && "ring-2 ring-white",
                        clip.locked && "opacity-60",
                        clip.missing && "border-dashed",
                      )}
                      style={{
                        left: clip.start * zoom,
                        width: Math.max(50, visibleClipDuration(clip) * zoom),
                        borderColor: clip.color ?? track.color,
                        backgroundColor: clip.missing ? "#3b1d1d" : `${clip.color ?? track.color}24`,
                        cursor: tool === "grabber" ? "grab" : tool === "trim" ? "ew-resize" : tool === "zoomer" ? "zoom-in" : "default",
                      }}
                    >
                      <b className="block truncate text-[11px] uppercase tracking-wide" style={{ color: clip.color ?? track.color }}>
                        {clip.missing ? "MISSING · " : ""}{clip.muted ? "MUTED · " : ""}{clip.name}
                      </b>
                      {clip.missing ? (
                        <label className="mt-2 inline-block cursor-pointer bg-red-400 px-2 py-1 text-[9px] font-black uppercase text-black">
                          Relink
                          <input
                            type="file"
                            accept="audio/*,.wav,.wave,.mp3,.m4a,.aac,.ogg,.oga,.webm,.flac,.aif,.aiff,.mp4"
                            className="sr-only"
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => event.target.files?.[0] && void relinkClip(clip.id, event.target.files[0])}
                          />
                        </label>
                      ) : (
                        <Wave peaks={clip.peaks} color={clip.color ?? track.color} gain={clip.gain} />
                      )}
                      <span className="absolute bottom-1 left-2 text-[9px] uppercase text-white/45">
                        gain {clip.gain} dB · fade {clip.fadeIn}/{clip.fadeOut}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
              <div className="absolute bottom-0 top-0 w-px bg-cyan-300 shadow-[0_0_10px_#67e8f9]" style={{ left: playhead * zoom }} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-[1fr_1fr_auto] gap-3 border-t border-black bg-[#20242b] px-3 py-2 text-[10px] uppercase text-white/50">
          <label>
            Selection start
            <input type="number" step="0.01" value={selectionStart} onChange={(event) => setSelectionStart(Number(event.target.value))} className="ml-2 w-24 bg-black px-2 py-1 font-mono text-green-300" />
          </label>
          <label>
            Selection end
            <input type="number" step="0.01" value={selectionEnd} onChange={(event) => setSelectionEnd(Number(event.target.value))} className="ml-2 w-24 bg-black px-2 py-1 font-mono text-green-300" />
          </label>
          <button onClick={() => setLoop(!loop)} className={loop ? "bg-cyan-300 px-3 font-black text-black" : "bg-[#30343b] px-3 font-black text-white/60"}>
            Loop {loop ? "On" : "Off"}
          </button>
        </div>
      </section>

      <div className="grid min-h-0 grid-rows-[1fr_180px] border-l border-black bg-[#20242b]">
        <div className="overflow-auto p-3 text-xs text-white/50">
          <b className="mb-3 block uppercase tracking-widest text-white/70">Edit Log</b>
          {editLog.length === 0 ? <p>No edits yet.</p> : editLog.map((item, index) => <p key={`${item}-${index}`} className="mb-2 border-b border-black/40 pb-2">{item}</p>)}
        </div>
        <RegionPanel
          selectionStart={selectionStart}
          selectionEnd={selectionEnd}
          setSelectionStart={setSelectionStart}
          setSelectionEnd={setSelectionEnd}
          loop={loop}
          setLoop={setLoop}
        />
      </div>
    </div>
  );
}
