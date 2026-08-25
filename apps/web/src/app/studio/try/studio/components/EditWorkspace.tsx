"use client";

import { useMemo } from "react";
import type { StudioClip, StudioEditMode, StudioExperienceMode, StudioTemplateId, StudioTool, StudioTrack } from "../types";
import { createClipDragIntent } from "../clipDrag";
import { formatTimelineTime, visibleClipDuration } from "../timeline";
import { Wave } from "./Wave";
import { Inspector } from "./Inspector";
import { StudioStart } from "./StudioStart";

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
  activateTake,
  tool,
  editMode,
  grid,
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
  punchEnabled,
  setPunchEnabled,
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
  onRecord,
  onBeat,
  experience,
  onTemplate,
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
  activateTake: (trackId: string, laneId: string, takeId: string) => void;
  tool: StudioTool;
  editMode: StudioEditMode;
  grid: number;
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
  punchEnabled: boolean;
  setPunchEnabled: (value: boolean) => void;
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
  moveClipToTrack: (id: string, start?: number, clipId?: string, sourceTrackId?: string) => void;
  onRecord: () => void;
  onBeat: () => void;
  experience: StudioExperienceMode;
  onTemplate: (id: StudioTemplateId) => void;
}) {
  const seconds = useMemo(() => Array.from({ length: Math.ceil(sessionEnd) + 1 }, (_, i) => i), [sessionEnd]);
  const timelineWidth = Math.max(1600, sessionEnd * zoom + 480);

  return (
    <div className="studio-editor min-w-0 overflow-hidden" style={{ gridColumn: "1 / -1", width: "100%" }}>
      <div className="studio-tracks min-w-0 overflow-hidden">
        <div className="studio-panel-title">
          <span>TRACKS</span><b>{tracks.length.toString().padStart(2, "0")}</b>
        </div>

        <div className="overflow-auto">
          {tracks.length === 0 && (
            <div className="studio-tracks__empty">
              Your tracks will appear here.
            </div>
          )}

          {tracks.map((track) => (
            <button
              key={track.id}
              onClick={() => setSelectedTrackId(track.id)}
              className={cn(
                "studio-track",
                selectedTrack?.id === track.id && "is-selected",
              )}
            >
              <span className="studio-track__color" style={{ backgroundColor: track.color }} />
              <span className="studio-track__body">
                <b>{track.name}</b>
                <span className="studio-track__meta">
                  {track.clips.length} clip{track.clips.length === 1 ? "" : "s"}
                </span>
                <span className="studio-track__meter">
                  <span style={{ width: `${track.volume}%`, backgroundColor: track.color }} />
                </span>
                {track.takeLanes?.map((lane) => <span key={lane.id} className="studio-track__takes" aria-label={`${lane.takes.length} recorded takes`}>
                  {lane.takes.map((take) => <button key={take.id} type="button" className={lane.activeTakeId === take.id ? "is-active" : ""} onClick={(event) => { event.stopPropagation(); activateTake(track.id, lane.id, take.id); }}>T{take.pass}</button>)}
                </span>)}
              </span>
              <span className="studio-track__switches">
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    updateTrack(track.id, { muted: !track.muted }, "Toggle mute");
                  }}
                  className={track.muted ? "is-mute" : ""}
                >
                  M
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    updateTrack(track.id, { solo: !track.solo }, "Toggle solo");
                  }}
                  className={track.solo ? "is-solo" : ""}
                >
                  S
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    arm(track.id);
                  }}
                  className={track.armed ? "is-armed" : ""}
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
        className="studio-timeline min-w-0 overflow-hidden"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void importFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <div className="studio-ruler" style={{ width: timelineWidth }}>
          <div className="studio-playhead studio-playhead--ruler" style={{ left: playhead * zoom }} />
          {seconds.map((second) => (
            <button
              key={second}
              onClick={() => setPlayhead(second)}
              className="studio-ruler__tick"
              style={{ left: second * zoom, width: zoom }}
            >
              {second % 2 === 0 ? formatTimelineTime(second) : second}
            </button>
          ))}
        </div>

        {tracks.length === 0 ? (
          <StudioStart experience={experience} onTemplate={onTemplate} onImport={(files) => void importFiles(files)} onRecord={onRecord} onBeat={onBeat} />
        ) : (
          <div className="studio-timeline__scroll">
            <div className="relative" style={{ width: timelineWidth }}>
              {tracks.map((track) => (
                <div key={track.id} className="studio-lane" onDragOver={(event) => { if (event.dataTransfer.types.includes("application/x-ems-studio-clip")) event.preventDefault(); }} onDrop={(event) => {
                  const value = event.dataTransfer.getData("application/x-ems-studio-clip");
                  if (!value) return;
                  event.preventDefault();
                  event.stopPropagation();
                  const payload = JSON.parse(value) as { clipId: string; sourceTrackId: string; pointerOffsetSeconds: number };
                  const sourceClip = tracks.find((item) => item.id === payload.sourceTrackId)?.clips.find((item) => item.id === payload.clipId);
                  if (!sourceClip) return;
                  const pointerSeconds = (event.clientX - event.currentTarget.getBoundingClientRect().left) / zoom;
                  const intent = createClipDragIntent({ clip: sourceClip, sourceTrackId: payload.sourceTrackId, targetTrackId: track.id, pointerSeconds, pointerOffsetSeconds: payload.pointerOffsetSeconds, mode: editMode, gridSeconds: grid });
                  if (intent.allowed) moveClipToTrack(track.id, intent.start, intent.clipId, intent.sourceTrackId);
                }}>
                  <div className="absolute inset-0">
                    {seconds.map((second) => (
                      <span key={second} className="studio-gridline" style={{ left: second * zoom, width: zoom }} />
                    ))}
                  </div>
                  <div className="studio-selection" style={{ left: selectionStart * zoom, width: Math.max(1, (selectionEnd - selectionStart) * zoom) }} />
                  {track.armed && <div className="studio-lane__armed" />}
                  {track.clips.map((clip) => (
                    <button
                      key={clip.id}
                      draggable={!clip.locked}
                      aria-label={`${clip.name}. ${clip.locked ? "Locked" : "Drag or use Alt plus arrow keys to move"}`}
                      onDragStart={(event) => {
                        if (clip.locked) return event.preventDefault();
                        const pointerOffsetSeconds = (event.clientX - event.currentTarget.getBoundingClientRect().left) / zoom;
                        event.dataTransfer.setData("application/x-ems-studio-clip", JSON.stringify({ clipId: clip.id, sourceTrackId: track.id, pointerOffsetSeconds }));
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      onKeyDown={(event) => {
                        if (clip.locked || !event.altKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
                        event.preventDefault();
                        setSelectedTrackId(track.id);
                        setSelectedClipId(clip.id);
                        if (event.key === "ArrowLeft" || event.key === "ArrowRight") moveClipToTrack(track.id, Math.max(0, clip.start + (event.key === "ArrowLeft" ? -grid : grid)), clip.id, track.id);
                        else {
                          const trackIndex = tracks.findIndex((item) => item.id === track.id);
                          const target = tracks[trackIndex + (event.key === "ArrowUp" ? -1 : 1)];
                          if (target) moveClipToTrack(target.id, clip.start, clip.id, track.id);
                        }
                      }}
                      onClick={() => {
                        setSelectedTrackId(track.id);
                        setSelectedClipId(clip.id);
                      }}
                      className={cn(
                        "studio-clip",
                        selectedClipId === clip.id && "is-selected",
                        clip.locked && "is-locked",
                        clip.missing && "is-missing",
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

        <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-3 border-t border-black bg-[#20242b] px-3 py-2 text-[10px] uppercase text-white/50">
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
          <button onClick={() => setPunchEnabled(!punchEnabled)} className={punchEnabled ? "bg-red-400 px-3 font-black text-black" : "bg-[#30343b] px-3 font-black text-white/60"} title="Record only inside the selected range">
            Punch {punchEnabled ? "On" : "Off"}
          </button>
        </div>
      </section>

    </div>
  );
}
