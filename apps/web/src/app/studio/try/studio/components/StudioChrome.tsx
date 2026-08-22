"use client";

import type { StudioEditMode, StudioMode, StudioTool } from "../types";
import { formatTimelineTime } from "../timeline";
import { getStudioModeLabel, getStudioSaveTone } from "../presentation";
import { StudioIcon, type StudioIconName } from "./StudioIcon";

const modes: Array<{ id: StudioMode; icon: StudioIconName }> = [
  { id: "edit", icon: "timeline" }, { id: "mix", icon: "mixer" }, { id: "beat", icon: "beat" }, { id: "export", icon: "archive" }, { id: "files", icon: "files" },
];

export function StudioChrome({ mode, setMode, title, setTitle, saveStatus, dirty, busy, playing, recording, tracksLength, playhead, onNew, onSave, onSaveAs, onRestore, onSnapshot, onArchive, onStop, onPlay, onRecord, onImport, undo, redo, tool, setTool, editMode, setEditMode, zoomOut, zoomIn, fit, bpm, setBpm, sampleRate, setSampleRate, nudge, setNudge, grid, setGrid }: {
  mode: StudioMode; setMode: (mode: StudioMode) => void; title: string; setTitle: (value: string) => void; saveStatus: string; dirty: boolean; busy: boolean; playing: boolean; recording: boolean; tracksLength: number; playhead: number;
  onNew: () => void; onSave: () => void; onSaveAs: () => void; onRestore: () => void; onSnapshot: () => void; onArchive: () => void; onStop: (reset?: boolean) => void; onPlay: () => void; onRecord: () => void; onImport: (files: FileList) => void;
  undo: () => void; redo: () => void; tool: StudioTool; setTool: (tool: StudioTool) => void; editMode: StudioEditMode; setEditMode: (mode: StudioEditMode) => void; zoomOut: () => void; zoomIn: () => void; fit: () => void; bpm: number; setBpm: (value: number) => void; sampleRate: number; setSampleRate: (value: number) => void; nudge: number; setNudge: (value: number) => void; grid: number; setGrid: (value: number) => void;
}) {
  const saveTone = getStudioSaveTone(saveStatus);
  return <header className="studio-command">
    <div className="studio-command__top">
      <button type="button" className="studio-brand" onClick={() => setMode("edit")} aria-label="Open Studio timeline"><span className="studio-brand__mark"><StudioIcon name="spark" /></span><span><b>EPIC</b><small>PLATINUM STUDIO</small></span></button>
      <nav className="studio-modes" aria-label="Studio workspaces">{modes.map(({ id, icon }) => <button key={id} type="button" onClick={() => setMode(id)} className={mode === id ? "is-active" : ""} aria-current={mode === id ? "page" : undefined}><StudioIcon name={icon}/><span>{getStudioModeLabel(id)}</span></button>)}</nav>
      <div className="studio-session"><span className="studio-session__eyebrow">CURRENT SESSION</span><input aria-label="Session title" value={title} onChange={(event) => setTitle(event.target.value)} /><span className={`studio-save studio-save--${saveTone.tone}`}><i />{dirty ? "Unsaved" : saveTone.label}</span></div>
      <div className="studio-counter"><small>PLAYHEAD</small><strong>{formatTimelineTime(playhead)}</strong></div>
    </div>
    <div className="studio-command__controls">
      <div className="studio-action-group"><button title="New session" onClick={onNew}>NEW</button><button title="Save session" onClick={onSave}><StudioIcon name="save"/> SAVE</button><button className="studio-action-more" onClick={onSaveAs}>SAVE AS</button><button className="studio-action-more" onClick={onRestore}>RESTORE</button><button className="studio-action-more" onClick={onSnapshot}>SNAPSHOT</button><button className="studio-action-more" onClick={onArchive}>ARCHIVE</button></div>
      <div className="studio-transport"><button aria-label="Return to start" onClick={() => onStop(true)}><span className="studio-return">|‹</span></button><button aria-label="Stop" onClick={() => onStop()}><StudioIcon name="stop"/></button><button className={`studio-play ${playing ? "is-playing" : ""}`} aria-label={playing ? "Pause" : "Play"} onClick={onPlay} disabled={!tracksLength}><StudioIcon name={playing ? "pause" : "play"}/></button><button className={`studio-record ${recording ? "is-recording" : ""}`} aria-label={recording ? "Stop recording" : "Record"} onClick={onRecord}><StudioIcon name="record"/></button></div>
      <label className="studio-import"><StudioIcon name="import"/><span>{busy ? "WORKING" : "IMPORT"}</span><input type="file" accept="audio/*,.wav,.wave,.mp3,.m4a,.aac,.ogg,.oga,.webm,.flac,.aif,.aiff,.mp4" multiple className="sr-only" onChange={(event) => event.target.files && onImport(event.target.files)} /></label>
      <div className="studio-tools"><button aria-label="Undo" onClick={undo}><StudioIcon name="undo"/></button><button aria-label="Redo" onClick={redo}><StudioIcon name="undo" className="rotate-180"/></button><button aria-label="Zoom out" onClick={zoomOut}><StudioIcon name="zoomOut"/></button><button aria-label="Zoom in" onClick={zoomIn}><StudioIcon name="zoomIn"/></button><button onClick={fit}>FIT</button></div>
      <div className="studio-selects"><label>TOOL<select value={tool} onChange={(event) => setTool(event.target.value as StudioTool)}>{["smart", "selector", "grabber", "trim", "pencil", "scrubber", "zoomer"].map((item) => <option key={item}>{item}</option>)}</select></label><label>MODE<select value={editMode} onChange={(event) => setEditMode(event.target.value as StudioEditMode)}>{["slip", "grid", "spot", "shuffle"].map((item) => <option key={item}>{item}</option>)}</select></label><label>NUDGE<select value={nudge} onChange={(event) => setNudge(Number(event.target.value))}><option value={.01}>10MS</option><option value={.05}>50MS</option><option value={.1}>100MS</option><option value={.25}>250MS</option><option value={1}>1S</option></select></label><label>GRID<select value={grid} onChange={(event) => setGrid(Number(event.target.value))}><option value={.125}>1/8</option><option value={.25}>1/4</option><option value={.5}>1/2</option><option value={1}>1S</option></select></label><label>BPM<input value={bpm} inputMode="numeric" onChange={(event) => setBpm(Number(event.target.value) || 92)} /></label><label>RATE<select value={sampleRate} onChange={(event) => setSampleRate(Number(event.target.value))}><option value={44100}>44.1K</option><option value={48000}>48K</option><option value={96000}>96K</option></select></label></div>
    </div>
  </header>;
}
