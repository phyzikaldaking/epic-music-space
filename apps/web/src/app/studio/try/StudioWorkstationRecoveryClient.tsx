"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { type DrumKind, type DrumKitId } from "@/components/daw/beatMachine";
import StudioPageShell from "@/components/studio/StudioPageShell";
import StudioLazyPanel from "./StudioLazyPanel";
import StudioProfiler from "./StudioProfiler";
import StudioScreenRuntime, { type StudioRuntimeMode } from "./StudioScreenRuntime";
import { StudioTelemetryPanel, StudioTelemetryProfiler, useStudioTelemetryProfiler } from "./StudioTelemetryProfiler";
import StudioTimeline from "./StudioTimeline";
import StudioTransportBar from "./StudioTransportBar";
import StudioWaveform from "./StudioWaveform";
import { getStudioAudioEngine } from "./studioAudioEngine";
import { decodeFileToClip } from "./studioClipUtils";
import { useStudioRecovery } from "./useStudioRecovery";
import StudioMultiWindowGuard from "./StudioMultiWindowGuard";
import { useStudioRealtimeBridge } from "./useStudioRealtimeBridge";
import { useStudioTransportClock } from "./useStudioTransportClock";
import { useStudioUndoRedo } from "./useStudioUndoRedo";
import { useStudioMidiBridge } from "./useStudioMidiBridge";
import type { StudioAudioBufferRef, StudioClip, StudioMode as Mode, StudioRuntimeState, StudioTrack, StudioTrackKind as TrackKind } from "./studioWorkstationTypes";

const LazyBeatTrackLane = dynamic(() => import("./BeatTrackLane"), { ssr: false, loading: () => <StudioLazyPanel label="Loading beat machine..." /> });
const LazyStudioMixerPanel = dynamic(() => import("./StudioMixerPanel"), { ssr: false, loading: () => <StudioLazyPanel label="Loading mixer..." /> });
const LazyStudioEditorPanel = dynamic(() => import("./StudioEditorPanel"), { ssr: false, loading: () => <StudioLazyPanel label="Loading editor..." /> });
const LazyStudioCollabPanel = dynamic(() => import("./StudioCollabPanel"), { ssr: false, loading: () => <StudioLazyPanel label="Loading collab..." /> });
const LazyStudioExportPanel = dynamic(() => import("./StudioExportPanel"), { ssr: false, loading: () => <StudioLazyPanel label="Loading export..." /> });
const LazyStudioSpectralSuitePanel = dynamic(() => import("./StudioSpectralSuitePanel"), { ssr: false, loading: () => <StudioLazyPanel label="Loading spectral suite..." /> });

type LayoutPreset = "producer" | "engineer" | "mixer" | "mastering" | "songwriter" | "label" | "artist";
type FullscreenPanel = "mixer" | "beat" | "editor" | "timeline" | "mastering" | null;
type SplitView = "none" | "beat-mixer" | "editor-mixer" | "timeline-spectral";
type FloatingPanel = "plugins" | "spectral" | "mixer" | "chat" | "ai" | "notes";
type WorkspaceLayout = { layoutPreset: LayoutPreset; fullscreenPanel: FullscreenPanel; splitView: SplitView; floatingPanels: FloatingPanel[] };
type BeatStem = { id?: string; label: string; name?: string; soundUrl?: string; soundId?: string; kind?: TrackKind; volume?: number; pan?: number; mixTemplate?: string };
type BeatStemsEventDetail = { stems?: BeatStem[]; kit?: string; instrument?: string; autoMix?: boolean };

const DEFAULT_KIT: DrumKitId = "trap";
const PROJECT_ID = "ems-default-project";
const COLORS = ["#17fff4", "#ff34df", "#f6d63d", "#42ff56", "#a855ff", "#ff7a2f", "#23d4ff", "#ff4f8b"];
const INITIAL_LAYOUT: WorkspaceLayout = { layoutPreset: "producer", fullscreenPanel: null, splitView: "beat-mixer", floatingPanels: [] };
const LAYOUT_PRESETS: LayoutPreset[] = ["producer", "engineer", "mixer", "mastering", "songwriter", "label", "artist"];
const SPLIT_VIEWS: SplitView[] = ["none", "beat-mixer", "editor-mixer", "timeline-spectral"];
const FLOATING_PANELS: FloatingPanel[] = ["plugins", "spectral", "mixer", "chat", "ai", "notes"];
const FULLSCREEN_PANELS: Exclude<FullscreenPanel, null>[] = ["mixer", "beat", "editor", "timeline", "mastering"];
const MODES: Mode[] = ["studio", "edit", "mix", "beat", "collab", "export"];
const MODE_DOCK: Record<Mode, { icon: string; label: string }> = {
  studio: { icon: "🏠", label: "Studio" },
  edit: { icon: "✂️", label: "Editor" },
  mix: { icon: "🎚️", label: "Mixer" },
  beat: { icon: "🥁", label: "Beat" },
  collab: { icon: "👥", label: "Collab" },
  export: { icon: "⬇️", label: "Export" },
};
const PADS: { label: string; kind: DrumKind; color: string }[] = [
  { label: "KICK", kind: "kick", color: "#17fff4" },
  { label: "SNARE", kind: "snare", color: "#ff34df" },
  { label: "CLAP", kind: "clap", color: "#f6d63d" },
  { label: "HAT", kind: "hat", color: "#42ff56" },
  { label: "OPEN", kind: "openHat", color: "#a855ff" },
  { label: "PERC", kind: "perc", color: "#ff7a2f" },
  { label: "808", kind: "bass808", color: "#23d4ff" },
  { label: "CRASH", kind: "crash", color: "#ff4f8b" },
];
const INITIAL_TRACKS: StudioTrack[] = [
  { id: "lead", name: "Lead Vox", kind: "vocal", color: "#ff34df", volume: 74, pan: 0, muted: false, solo: false, armed: true, meter: 72, height: 72 },
  { id: "drums", name: "Drums", kind: "drum", color: "#17fff4", volume: 82, pan: 0, muted: false, solo: false, armed: false, meter: 88, height: 60 },
  { id: "bass", name: "808 Bass", kind: "bass", color: "#f6d63d", volume: 68, pan: -8, muted: false, solo: false, armed: false, meter: 61, height: 56 },
  { id: "keys", name: "Keys", kind: "melody", color: "#42ff56", volume: 63, pan: 12, muted: false, solo: false, armed: false, meter: 54, height: 56 },
  { id: "pad", name: "Atmos Pad", kind: "melody", color: "#a855ff", volume: 58, pan: 16, muted: false, solo: false, armed: false, meter: 49, height: 48 },
  { id: "hook", name: "Hook Stack", kind: "vocal", color: "#ff7a2f", volume: 70, pan: -14, muted: false, solo: false, armed: false, meter: 66, height: 64 },
  { id: "fx", name: "FX", kind: "fx", color: "#23d4ff", volume: 52, pan: 20, muted: false, solo: false, armed: false, meter: 37, height: 44 },
  { id: "master", name: "Master", kind: "audio", color: "#ff4f8b", volume: 80, pan: 0, muted: false, solo: false, armed: false, meter: 78, height: 48 },
];

const profilerEnabled = process.env.NEXT_PUBLIC_STUDIO_PROFILER === "1";
function isTypingTarget(target: EventTarget | null) { const el = target as HTMLElement | null; const tag = el?.tagName?.toLowerCase(); return tag === "input" || tag === "textarea" || tag === "select" || Boolean(el?.isContentEditable); }
function isTrackArray(value: unknown): value is StudioTrack[] { return Array.isArray(value) && value.every((item) => typeof item === "object" && item !== null && "id" in item && "name" in item && "kind" in item); }
function isClipArray(value: unknown): value is StudioClip[] { return Array.isArray(value) && value.every((item) => typeof item === "object" && item !== null && "id" in item && "trackId" in item && "waveform" in item); }
function isBufferArray(value: unknown): value is StudioAudioBufferRef[] { return Array.isArray(value) && value.every((item) => typeof item === "object" && item !== null && "id" in item && "peaks" in item); }
function safeMode(value: unknown): Mode | null { return typeof value === "string" && MODES.includes(value as Mode) ? value as Mode : null; }
function safeLayout(value: unknown): WorkspaceLayout | null {
  if (typeof value !== "object" || value === null) return null;
  const item = value as Partial<WorkspaceLayout>;
  if (!LAYOUT_PRESETS.includes(item.layoutPreset as LayoutPreset)) return null;
  if (item.fullscreenPanel !== null && item.fullscreenPanel !== undefined && !FULLSCREEN_PANELS.includes(item.fullscreenPanel as Exclude<FullscreenPanel, null>)) return null;
  if (!SPLIT_VIEWS.includes(item.splitView as SplitView)) return null;
  const floatingPanels = Array.isArray(item.floatingPanels) ? item.floatingPanels.filter((panel): panel is FloatingPanel => FLOATING_PANELS.includes(panel as FloatingPanel)) : [];
  return { layoutPreset: item.layoutPreset as LayoutPreset, fullscreenPanel: item.fullscreenPanel ?? null, splitView: item.splitView as SplitView, floatingPanels };
}
function trackNameForKind(kind: TrackKind, index: number) { if (kind === "audio") return `Audio ${index}`; if (kind === "instrument") return `Instrument ${index}`; if (kind === "midi") return `MIDI ${index}`; if (kind === "drum") return `Drum ${index}`; if (kind === "bass") return `Bass ${index}`; if (kind === "vocal") return `Vocal ${index}`; if (kind === "fx") return `FX ${index}`; return `Melody ${index}`; }
function notify(message: string) { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("ems:studio-toast", { detail: { message } })); }
function safeTrackKind(value: unknown, label = ""): TrackKind {
  const valid: TrackKind[] = ["audio", "instrument", "midi", "drum", "melody", "bass", "vocal", "fx"];
  if (typeof value === "string" && valid.includes(value as TrackKind)) return value as TrackKind;
  return label === "808" ? "bass" : ["KICK", "SNARE", "CLAP", "HAT", "OPEN", "PERC", "CRASH"].includes(label) ? "drum" : "audio";
}
function stemMixPatch(stem: BeatStem, index: number): Pick<StudioTrack, "volume" | "pan" | "meter"> {
  const label = `${stem.label} ${stem.name ?? ""}`.toLowerCase();
  if (label.includes("kick")) return { volume: 84, pan: 0, meter: 86 };
  if (label.includes("808") || label.includes("bass")) return { volume: 76, pan: 0, meter: 74 };
  if (label.includes("snare") || label.includes("clap")) return { volume: 72, pan: 0, meter: 68 };
  if (label.includes("hat") || label.includes("open") || label.includes("perc")) return { volume: 56, pan: index % 2 ? 18 : -18, meter: 54 };
  if (label.includes("crash") || label.includes("fx")) return { volume: 48, pan: index % 2 ? 28 : -28, meter: 42 };
  return { volume: 62, pan: index % 2 ? 8 : -8, meter: 52 };
}
function stemColor(label: string, index: number) { return PADS.find((pad) => pad.label === label)?.color ?? COLORS[index % COLORS.length]; }

export default function StudioWorkstationRecoveryClient() {
  const [mode, setMode] = useState<Mode>("beat");
  const [workspaceLayout, setWorkspaceLayout] = useState<WorkspaceLayout>(INITIAL_LAYOUT);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [bpm, setBpm] = useState(92);
  const [zoom, setZoom] = useState(1);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const transport = useStudioTransportClock({ bpm, initialBar: 1 });
  const [tracks, setTracks] = useState<StudioTrack[]>(INITIAL_TRACKS);
  const [clips, setClips] = useState<StudioClip[]>([]);
  const [audioBuffers, setAudioBuffers] = useState<StudioAudioBufferRef[]>([]);
  const [selectedTrack, setSelectedTrack] = useState("lead");
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [activePad, setActivePad] = useState<string | null>(null);
  const telemetry = useStudioTelemetryProfiler();
  const selected = useMemo(() => tracks.find((track) => track.id === selectedTrack) ?? tracks[0], [tracks, selectedTrack]);
  const instrumentTracks = useMemo(() => tracks.filter((track) => ["drum", "bass", "melody", "instrument", "midi", "fx"].includes(track.kind)), [tracks]);
  const runtimeState = useMemo<StudioRuntimeState>(() => {
    const secondsPerBeat = 60 / Math.max(1, bpm);
    const absoluteBeat = transport.positionSec / Math.max(secondsPerBeat, 0.001);
    const pixelsPerSecond = Math.round(72 * zoom);
    return {
      playing: transport.playing,
      positionSec: transport.positionSec,
      bpm,
      bars: transport.bar,
      beats: Math.max(1, Math.floor(absoluteBeat % 4) + 1),
      zoom,
      pixelsPerSecond,
      selectedTrackId: selectedTrack,
      selectedClipId,
      clips,
      audioBuffers,
      tracks: tracks.map((track, index) => ({ ...track, index, effectiveHeight: track.collapsed ? 28 : Math.max(36, track.height ?? 48), isSelected: track.id === selectedTrack, clips: clips.filter((clip) => clip.trackId === track.id) })),
    };
  }, [audioBuffers, bpm, clips, selectedClipId, selectedTrack, tracks, transport.bar, transport.playing, transport.positionSec, zoom]);

  const recovery = useStudioRecovery({ mode, selectedTrack, selectedClipId, bpm, bar: transport.bar, playing: transport.playing, tracks, clips, audioBuffers, workspaceLayout, zoom, transportState: { positionSec: transport.positionSec, bar: transport.bar, playing: transport.playing, bpm }, mixerState: tracks.map(({ id, volume, pan, muted, solo }) => ({ id, volume, pan, muted, solo })), viewportState: { zoom, selectedTrack, selectedClipId }, automation: [] }, (payload) => {
    const restoredMode = safeMode(payload.mode); if (restoredMode) setMode(restoredMode);
    const restoredLayout = safeLayout(payload.workspaceLayout); if (restoredLayout) setWorkspaceLayout(restoredLayout);
    if (typeof payload.zoom === "number") setZoom(Math.max(0.45, Math.min(3, payload.zoom)));
    if (typeof payload.selectedTrack === "string") setSelectedTrack(payload.selectedTrack);
    if (typeof payload.selectedClipId === "string") setSelectedClipId(payload.selectedClipId);
    if (typeof payload.bpm === "number") setBpm(payload.bpm);
    if (typeof payload.bar === "number") transport.setBar(payload.bar);
    if (isTrackArray(payload.tracks)) setTracks(payload.tracks);
    if (isClipArray(payload.clips)) setClips(payload.clips.filter((clip) => clip.source !== "placeholder"));
    if (isBufferArray(payload.audioBuffers)) setAudioBuffers(payload.audioBuffers);
    transport.stop();
  });
  const realtime = useStudioRealtimeBridge({ projectId: PROJECT_ID, sessionId: recovery.sessionId });
  const undoRedo = useStudioUndoRedo<StudioTrack[]>(tracks, (value) => { setTracks(value); void realtime.push({ type: "state.patch", payload: { tracks: value } }); });
  const midi = useStudioMidiBridge(recovery.sessionId);

  function updateWorkspaceLayout(patch: Partial<WorkspaceLayout>) { setWorkspaceLayout((current) => { const next = { ...current, ...patch }; void realtime.push({ type: "state.patch", payload: { workspaceLayout: next } }); return next; }); }
  function toggleFloatingPanel(panel: FloatingPanel) { setWorkspaceLayout((current) => { const hasPanel = current.floatingPanels.includes(panel); const next = { ...current, floatingPanels: hasPanel ? current.floatingPanels.filter((item) => item !== panel) : [...current.floatingPanels, panel] }; void realtime.push({ type: "state.patch", payload: { workspaceLayout: next } }); return next; }); }
  function activateMode(nextMode: Mode) { setMode(nextMode); updateWorkspaceLayout({ fullscreenPanel: null, splitView: "none" }); void realtime.push({ type: "state.patch", payload: { mode: nextMode } }); if (typeof window !== "undefined") window.scrollTo({ top: 0, left: 0, behavior: "auto" }); }
  function selectTrack(id: string) { setSelectedTrack(id); void realtime.push({ type: "selection.set", target: id }); }
  function togglePlay() { transport.toggle(); void realtime.push({ type: "transport.patch", payload: { playing: !transport.playing, bpm, bar: transport.bar, positionSec: transport.positionSec } }); }
  function changeBpm(delta: number) { setBpm((value) => { const next = Math.max(60, Math.min(180, value + delta)); void realtime.push({ type: "transport.patch", payload: { bpm: next, playing: transport.playing, bar: transport.bar, positionSec: transport.positionSec } }); return next; }); }
  function firePad(kind: DrumKind, label: string) { getStudioAudioEngine().playDrum(kind, { kit: DEFAULT_KIT, velocity: 0.9 }); setActivePad(label); void realtime.push({ type: "beat.pattern", target: label, payload: { kind, label, bpm, bar: transport.bar, positionSec: transport.positionSec } }); window.setTimeout(() => setActivePad(null), 120); }
  function updateTrack(id: string, patch: Partial<StudioTrack>) { setTracks((current) => { const next = current.map((track) => track.id === id ? { ...track, ...patch } : track); const changed = next.find((track) => track.id === id); undoRedo.record("Track change", current, next); void realtime.push({ type: "track.upsert", target: id, payload: changed ?? { id, ...patch } }); return next; }); }
  function addTrack(kind: TrackKind = "audio") { const index = tracks.length + 1; const track: StudioTrack = { id: `track-${Date.now()}`, name: trackNameForKind(kind, index), kind, color: COLORS[index % COLORS.length], volume: 62, pan: 0, muted: false, solo: false, armed: kind !== "audio" && kind !== "fx", meter: 24, height: kind === "audio" ? 72 : kind === "midi" ? 64 : 60, collapsed: false }; setTracks((current) => { const master = current.find((item) => item.id === "master"); const next = master ? [...current.filter((item) => item.id !== "master"), track, master] : [...current, track]; undoRedo.record("Add track", current, next); return next; }); void realtime.push({ type: "track.upsert", target: track.id, payload: track }); selectTrack(track.id); activateMode(kind === "audio" || kind === "vocal" ? "edit" : "beat"); }
  function ingestBeatStems(detail: BeatStemsEventDetail) {
    const stems = Array.isArray(detail.stems) ? detail.stems : [];
    if (!stems.length) return;
    const createdAt = Date.now();
    setTracks((current) => {
      const master = current.find((item) => item.id === "master");
      const existing = current.filter((item) => item.id !== "master");
      const nextStems = stems.map((stem, index): StudioTrack => {
        const mix = stemMixPatch(stem, index);
        const kind = safeTrackKind(stem.kind, stem.label);
        return {
          id: `stem-${stem.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${createdAt}-${index}`,
          name: `${stem.label} Stem`,
          kind,
          color: stemColor(stem.label, index),
          volume: typeof stem.volume === "number" ? stem.volume : mix.volume,
          pan: typeof stem.pan === "number" ? stem.pan : mix.pan,
          muted: false,
          solo: false,
          armed: false,
          meter: mix.meter,
          height: kind === "bass" ? 64 : kind === "drum" ? 60 : 72,
          collapsed: false,
          customSoundUrl: stem.soundUrl,
          sampleName: stem.name ?? `${stem.label} Stem`,
        };
      });
      const next = master ? [...existing, ...nextStems, master] : [...existing, ...nextStems];
      undoRedo.record("Import beat stems", current, next);
      nextStems.forEach((track) => void realtime.push({ type: "track.upsert", target: track.id, payload: track }));
      return next;
    });
    setSelectedTrack(`stem-${stems[0].label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${createdAt}-0`);
    setMode("mix");
    setWorkspaceLayout((current) => ({ ...current, splitView: "beat-mixer", fullscreenPanel: null, layoutPreset: "engineer" }));
    notify(`Loaded ${stems.length} named beat stems into the studio mixer.`);
  }
  function armSelectedTrack() { updateTrack(selectedTrack, { armed: true }); activateMode("edit"); notify("Track armed. Import or record real audio to create a clip."); }
  function openAudioImport() { importInputRef.current?.click(); }
  async function importAudioFile(file: File) { const track = tracks.find((item) => item.id === selectedTrack) ?? tracks[0]; if (!track) return; const engine = getStudioAudioEngine(); if (engine.context.state === "suspended") await engine.context.resume(); const { bufferRef, clip } = await decodeFileToClip(file, engine.context, track, Math.max(0, transport.positionSec)); setAudioBuffers((current) => [...current, bufferRef]); setClips((current) => [...current, clip]); setSelectedClipId(clip.id); void realtime.push({ type: "clip.upsert", target: clip.id, payload: clip }); notify(`Imported ${file.name} as a real decoded clip.`); }

  useEffect(() => { function onKeyDown(event: KeyboardEvent) { if (isTypingTarget(event.target)) return; if (event.code === "Space" && !event.repeat) { event.preventDefault(); togglePlay(); } const pad = PADS[Number(event.key) - 1]; if (pad) firePad(pad.kind, pad.label); } window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown); }, [transport.playing, transport.bar, transport.positionSec, bpm]);
  useEffect(() => { function onBeatStems(event: Event) { ingestBeatStems((event as CustomEvent<BeatStemsEventDetail>).detail ?? {}); } window.addEventListener("ems:beat-stems-to-session", onBeatStems); return () => window.removeEventListener("ems:beat-stems-to-session", onBeatStems); }, []);
  useEffect(() => { void realtime.push({ type: "transport.patch", payload: { playing: transport.playing, bpm, bar: transport.bar, positionSec: transport.positionSec } }); }, [transport.playing, transport.bar, transport.positionSec, bpm]);
  useEffect(() => () => { getStudioAudioEngine().close().catch(() => undefined); }, []);

  const timelineNode = <StudioProfiler id="studio-timeline"><StudioTelemetryProfiler id="timeline" onRender={telemetry.onRender}><StudioTimeline tracks={tracks} selectedTrack={selectedTrack} setSelectedTrack={selectTrack} playing={transport.playing} bar={transport.bar} positionSec={transport.positionSec} bpm={bpm} runtime={runtimeState} selectedClipId={selectedClipId} setSelectedClipId={setSelectedClipId} updateTrack={updateTrack} /></StudioTelemetryProfiler></StudioProfiler>;
  const mixerNode = <StudioProfiler id="studio-mixer"><StudioTelemetryProfiler id="mixer" onRender={telemetry.onRender}><LazyStudioMixerPanel tracks={tracks} selectedTrack={selectedTrack} playing={transport.playing} setSelectedTrack={selectTrack} updateTrack={updateTrack} /></StudioTelemetryProfiler></StudioProfiler>;
  const editorNode = <LazyStudioEditorPanel tracks={tracks} selectedTrack={selectedTrack} setSelectedTrack={selectTrack} addTrack={addTrack} />;
  const beatNode = <StudioProfiler id="studio-beat"><LazyBeatTrackLane tracks={instrumentTracks} pads={PADS} activePad={activePad} selectedTrack={selectedTrack} midi={midi} onFirePad={firePad} onAddTrack={addTrack} onSelectTrack={selectTrack} onUpdateTrack={updateTrack} /></StudioProfiler>;
  const spectralNode = <StudioTelemetryProfiler id="spectral-meter" onRender={telemetry.onRender}><LazyStudioSpectralSuitePanel /></StudioTelemetryProfiler>;
  const activeRuntimeMode: StudioRuntimeMode = workspaceLayout.fullscreenPanel === "mastering" ? "mastering" : mode;
  const activeLabel = workspaceLayout.fullscreenPanel ?? (workspaceLayout.splitView !== "none" ? workspaceLayout.splitView : mode);
  const activePanel = workspaceLayout.fullscreenPanel === "mixer" ? mixerNode : workspaceLayout.fullscreenPanel === "beat" ? beatNode : workspaceLayout.fullscreenPanel === "editor" ? editorNode : workspaceLayout.fullscreenPanel === "timeline" ? timelineNode : workspaceLayout.fullscreenPanel === "mastering" ? spectralNode : workspaceLayout.splitView === "beat-mixer" ? <div className="grid min-w-[1180px] grid-cols-2 gap-2">{beatNode}{mixerNode}</div> : workspaceLayout.splitView === "editor-mixer" ? <div className="grid min-w-[1180px] grid-cols-2 gap-2">{editorNode}{mixerNode}</div> : workspaceLayout.splitView === "timeline-spectral" ? <div className="grid min-w-[1180px] grid-rows-[450px_1fr] gap-2">{timelineNode}{spectralNode}</div> : mode === "studio" ? <StudioOverview tracks={tracks} addTrack={addTrack} setMode={activateMode} runtime={runtimeState} setZoom={setZoom} openAudioImport={openAudioImport} armSelectedTrack={armSelectedTrack} /> : mode === "mix" ? mixerNode : mode === "edit" ? editorNode : mode === "beat" ? beatNode : mode === "collab" ? <LazyStudioCollabPanel /> : <LazyStudioExportPanel projectId={PROJECT_ID} sessionId={recovery.sessionId} />;

  return <StudioPageShell><StudioMultiWindowGuard sessionId={recovery.sessionId} /><div className="relative mx-auto flex min-h-screen w-full min-w-[1560px] flex-col gap-2 p-2 sm:p-3" data-ems-workspace>{profilerEnabled && <StudioTelemetryPanel summary={telemetry.summary} />}<input ref={importInputRef} type="file" accept="audio/*" className="sr-only" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void importAudioFile(file); event.currentTarget.value = ""; }} /><div className="ems-sticky-transport"><StudioProfiler id="studio-transport"><StudioTelemetryProfiler id="transport" onRender={telemetry.onRender}><StudioTransportBar playing={transport.playing} bpm={bpm} bar={transport.bar} realtimeStatus={realtime.status} realtimeRevision={realtime.revision} canUndo={undoRedo.canUndo} canRedo={undoRedo.canRedo} onTogglePlay={togglePlay} onUndo={undoRedo.undo} onRedo={undoRedo.redo} onChangeBpm={changeBpm} recoveryStatus={recovery.status} lastSavedAt={recovery.lastSavedAt} canRestore={Boolean(recovery.recoverable)} onSave={recovery.save} onRestore={recovery.restoreSnapshot} /></StudioTelemetryProfiler></StudioProfiler></div><StudioIconDock mode={mode} activateMode={activateMode} toolsOpen={toolsOpen} setToolsOpen={setToolsOpen} /><WorkspaceLayoutBar open={toolsOpen} layout={workspaceLayout} setLayout={updateWorkspaceLayout} toggleFloatingPanel={toggleFloatingPanel} /><div className="grid min-h-[calc(100dvh-126px)] min-w-[1500px] grid-cols-[56px_minmax(1320px,1fr)] gap-2 rounded-[16px] border border-white/15 bg-[#10151a]/92 p-2 shadow-[0_0_34px_rgba(0,245,255,.10)] ring-1 ring-cyan-300/10"><aside className="ems-fl-dock flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-black/75 p-2 backdrop-blur">{MODES.map((item) => <button key={item} title={MODE_DOCK[item].label} data-testid={`studio-mode-${item}`} onClick={() => activateMode(item)} className={`grid h-10 w-10 place-items-center rounded-lg border text-lg transition ${mode === item ? "border-cyan-300 bg-cyan-300/18 text-cyan-100" : "border-white/10 bg-white/[.03] text-white/55 hover:text-white"}`}>{MODE_DOCK[item].icon}</button>)}</aside><StudioScreenRuntime mode={activeRuntimeMode} activeLabel={activeLabel} timeline={timelineNode} inspector={<StudioProfiler id="studio-waveform-inspector"><StudioTelemetryProfiler id="waveform" onRender={telemetry.onRender}><Inspector selected={selected} updateTrack={updateTrack} /></StudioTelemetryProfiler></StudioProfiler>} rack={<StudioTelemetryProfiler id="plugin-rack" onRender={telemetry.onRender}><FxRack selected={selected} /></StudioTelemetryProfiler>} spectral={mode === "studio" ? spectralNode : undefined}>{activePanel}</StudioScreenRuntime></div>{workspaceLayout.floatingPanels.length > 0 && <FloatingPanelDock panels={workspaceLayout.floatingPanels} toggleFloatingPanel={toggleFloatingPanel} />}</div></StudioPageShell>;
}

function StudioIconDock({ mode, activateMode, toolsOpen, setToolsOpen }: { mode: Mode; activateMode: (mode: Mode) => void; toolsOpen: boolean; setToolsOpen: (open: boolean) => void }) { return <nav className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/60 p-2 text-[10px] font-black uppercase tracking-widest text-white/50"><span className="mr-1 text-cyan-100">Screens</span>{MODES.map((item) => <button key={item} onClick={() => activateMode(item)} className={`flex items-center gap-1 rounded-full border px-3 py-1.5 ${mode === item ? "border-cyan-300 bg-cyan-300/15 text-cyan-100" : "border-white/10 bg-white/[.03] text-white/55"}`}><span>{MODE_DOCK[item].icon}</span><span>{MODE_DOCK[item].label}</span></button>)}<button onClick={() => setToolsOpen(!toolsOpen)} className={`ml-auto rounded-full border px-3 py-1.5 ${toolsOpen ? "border-yellow-300 bg-yellow-300/15 text-yellow-100" : "border-white/10 text-white/55"}`}>🛠 Tools</button></nav>; }
function WorkspaceLayoutBar({ open, layout, setLayout, toggleFloatingPanel }: { open: boolean; layout: WorkspaceLayout; setLayout: (patch: Partial<WorkspaceLayout>) => void; toggleFloatingPanel: (panel: FloatingPanel) => void }) { if (!open) return null; return <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/55 p-2 text-[10px] uppercase tracking-widest text-white/50 backdrop-blur"><span className="font-black text-cyan-100">Workspace tools</span>{LAYOUT_PRESETS.map((preset) => <button key={preset} onClick={() => setLayout({ layoutPreset: preset })} className={`rounded-full border px-3 py-1 font-black ${layout.layoutPreset === preset ? "border-cyan-300 bg-cyan-300/15 text-cyan-100" : "border-white/10 bg-white/[.03] text-white/45"}`}>{preset}</button>)}<span className="ml-2 font-black text-pink-100">Fullscreen</span><button onClick={() => setLayout({ fullscreenPanel: null })} className={`rounded-full border px-3 py-1 ${layout.fullscreenPanel === null ? "border-green-300 bg-green-300/15 text-green-100" : "border-white/10 text-white/45"}`}>off</button>{FULLSCREEN_PANELS.map((panel) => <button key={panel} onClick={() => setLayout({ fullscreenPanel: panel, splitView: "none" })} className={`rounded-full border px-3 py-1 ${layout.fullscreenPanel === panel ? "border-pink-300 bg-pink-300/15 text-pink-100" : "border-white/10 text-white/45"}`}>{panel}</button>)}<span className="ml-2 font-black text-yellow-100">Split</span>{SPLIT_VIEWS.map((split) => <button key={split} onClick={() => setLayout({ splitView: split, fullscreenPanel: null })} className={`rounded-full border px-3 py-1 ${layout.splitView === split ? "border-yellow-300 bg-yellow-300/15 text-yellow-100" : "border-white/10 text-white/45"}`}>{split}</button>)}<span className="ml-2 font-black text-purple-100">Float</span>{FLOATING_PANELS.map((panel) => <button key={panel} onClick={() => toggleFloatingPanel(panel)} className={`rounded-full border px-3 py-1 ${layout.floatingPanels.includes(panel) ? "border-purple-300 bg-purple-300/15 text-purple-100" : "border-white/10 text-white/45"}`}>{panel}</button>)}</div>; }
function FloatingPanelDock({ panels, toggleFloatingPanel }: { panels: FloatingPanel[]; toggleFloatingPanel: (panel: FloatingPanel) => void }) { return <div className="fixed bottom-4 right-4 z-[90] grid w-[280px] gap-2">{panels.map((panel) => <div key={panel} className="rounded-2xl border border-cyan-300/25 bg-black/85 p-3 shadow-[0_0_30px_rgba(0,245,255,.16)] backdrop-blur"><div className="flex items-center justify-between"><b className="text-xs uppercase tracking-widest text-cyan-100">{panel}</b><button onClick={() => toggleFloatingPanel(panel)} className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase text-white/55">close</button></div><p className="mt-2 text-xs text-white/50">Floating {panel} window foundation is active. Dock, drag, and resize wiring can now attach here.</p></div>)}</div>; }
function Inspector({ selected, updateTrack }: { selected: StudioTrack; updateTrack: (id: string, patch: Partial<StudioTrack>) => void }) { return <aside className="ems-panel-scroll rounded-xl border border-yellow-300/25 bg-[#151414] p-3 pr-2"><p className="text-[10px] font-black uppercase tracking-[0.22em] text-yellow-200/70">Inspector</p><h2 className="mt-1 truncate text-xl font-black uppercase tracking-wider" style={{ color: selected.color }}>{selected.name}</h2><div className="mt-3 rounded-lg border border-white/10 bg-black/40 p-2"><div className="relative h-20 overflow-hidden rounded bg-black"><StudioWaveform color={selected.color} row={2} waveform={selected.waveform} emptyLabel="No decoded audio" /></div></div><div className="mt-3 grid grid-cols-3 gap-2">{[["Mute", "muted"], ["Solo", "solo"], ["Arm", "armed"]].map(([label, key]) => <button key={key} onClick={() => updateTrack(selected.id, { [key]: !selected[key as keyof StudioTrack] } as Partial<StudioTrack>)} className={`rounded-full border px-2 py-2 text-[10px] font-black uppercase ${selected[key as keyof StudioTrack] ? "border-pink-300 bg-pink-400/18 text-pink-100" : "border-white/10 bg-white/[.04] text-white/55"}`}>{label}</button>)}</div><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => updateTrack(selected.id, { collapsed: !selected.collapsed })} className="rounded-full border border-cyan-300/25 px-3 py-2 text-[10px] font-black uppercase text-cyan-100">{selected.collapsed ? "Expand" : "Collapse"}</button><input aria-label="Track height" type="range" min="36" max="180" value={selected.height ?? 56} onChange={(event) => updateTrack(selected.id, { height: Number(event.target.value), collapsed: false })} className="accent-cyan-300" /></div><KnobGrid selected={selected} /></aside>; }
function KnobGrid({ selected }: { selected: StudioTrack }) { return <div className="mt-3 grid grid-cols-3 gap-3">{["Gain", "Tone", "Comp", "Delay", "Verb", "Drive", "Width", "Gate", "Limit"].map((label, index) => <div key={label} className="text-center"><div className="mx-auto grid h-11 w-11 place-items-center rounded-full border bg-black will-change-transform [contain:layout_paint]" style={{ borderColor: selected.color }}><span className="h-1 w-5 rounded-full will-change-transform" style={{ background: selected.color, transform: `rotate(${index * 28 - 35}deg)` }} /></div><p className="mt-1 text-[9px] uppercase text-white/45">{label}</p></div>)}</div>; }
function StudioOverview({ tracks, addTrack, setMode, runtime, setZoom, openAudioImport, armSelectedTrack }: { tracks: StudioTrack[]; addTrack: (kind?: TrackKind) => void; setMode: (mode: Mode) => void; runtime: StudioRuntimeState; setZoom: (zoom: number) => void; openAudioImport: () => void; armSelectedTrack: () => void }) { return <section className="ems-panel-scroll rounded-xl border border-cyan-300/20 bg-[#0b1115] p-3 pr-2"><p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200/65">Real audio studio</p><h2 className="mt-1 text-2xl font-black uppercase">No fake clips. Import audio or arm a track.</h2><div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-black/35 p-3 text-xs text-white/55 md:grid-cols-6"><span>Playing: {runtime.playing ? "yes" : "no"}</span><span>Position: {runtime.positionSec.toFixed(2)}s</span><span>BPM: {runtime.bpm}</span><span>PX/S: {runtime.pixelsPerSecond}</span><span>Clips: {runtime.clips.length}</span><span>Buffers: {runtime.audioBuffers.length}</span></div><div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3"><button onClick={() => setMode("edit")} className="rounded-xl border border-pink-300/25 bg-pink-300/10 p-3 text-left"><b>Edit / Record</b><p className="mt-2 text-xs text-white/55">Real clips only. Import audio or arm a track first.</p></button><button onClick={() => setMode("mix")} className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 p-3 text-left"><b>Mixer</b><p className="mt-2 text-xs text-white/55">Faders, meters, pan and channel controls.</p></button><Link href="/studio/beat-machine#piano-roll" className="rounded-xl border border-green-300/25 bg-green-300/10 p-3 text-left"><b>Full Beat Machine</b><p className="mt-2 text-xs text-white/55">Open the full piano roll and sequencer.</p></Link></div><div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-8"><button onClick={() => addTrack("audio")} className="rounded-lg border border-cyan-300/30 py-2 text-xs font-black uppercase text-cyan-100">+ Audio</button><button onClick={() => addTrack("instrument")} className="rounded-lg border border-green-300/30 py-2 text-xs font-black uppercase text-green-100">+ Instrument</button><button onClick={() => addTrack("midi")} className="rounded-lg border border-purple-300/30 py-2 text-xs font-black uppercase text-purple-100">+ MIDI</button><button onClick={() => addTrack("drum")} className="rounded-lg border border-cyan-300/30 py-2 text-xs font-black uppercase text-cyan-100">+ Drum</button><button onClick={() => addTrack("vocal")} className="rounded-lg border border-pink-300/30 py-2 text-xs font-black uppercase text-pink-100">+ Vocal</button><button onClick={openAudioImport} className="rounded-lg border border-yellow-300/30 py-2 text-xs font-black uppercase text-yellow-100">Import Audio</button><button onClick={armSelectedTrack} className="rounded-lg border border-red-300/30 py-2 text-xs font-black uppercase text-red-100">Arm Track</button><button onClick={() => setMode("beat")} className="rounded-lg border border-green-300/30 py-2 text-xs font-black uppercase text-green-100">Beat Lane</button></div><div className="mt-3 flex gap-2"><button onClick={() => setZoom(0.75)} className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/55">Fit 75%</button><button onClick={() => setZoom(1)} className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/55">Fit 100%</button><button onClick={() => setZoom(1.4)} className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/55">Zoom 140%</button></div><div className="mt-4 grid gap-2">{tracks.map((track) => <div key={track.id} className="rounded-lg border border-white/10 bg-black/35 p-3"><span className="font-black uppercase" style={{ color: track.color }}>{track.name}</span><span className="ml-3 text-xs uppercase text-white/40">{track.kind}</span></div>)}</div></section>; }
function FxRack({ selected }: { selected: StudioTrack }) { return <aside className="ems-panel-scroll rounded-xl border border-white/10 bg-black/55 p-2 pr-1"><p className="text-[10px] font-black uppercase tracking-[0.22em] text-pink-200/70">Rack</p>{["Preamp", "Compressor", "EQ", "Echo", "Reverb", "Limiter"].map((fx, index) => <div key={fx} className="mt-2 rounded-lg border border-white/10 bg-white/[.035] p-2 will-change-transform [contain:layout_paint]"><div className="flex items-center justify-between"><span className="text-[10px] font-black uppercase tracking-widest text-white/55">{fx}</span><span className="h-2 w-2 rounded-full" style={{ background: selected.color }} /></div><div className="mt-2 flex gap-2">{[0,1,2].map((n) => <div key={n} className="grid h-8 w-8 place-items-center rounded-full border will-change-transform [contain:layout_paint]" style={{ borderColor: index === n ? selected.color : "rgba(255,255,255,.12)" }}><span className="h-0.5 w-4 will-change-transform" style={{ background: selected.color, transform: `rotate(${index * 22 + n * 31}deg)` }} /></div>)}</div></div>)}</aside>; }
