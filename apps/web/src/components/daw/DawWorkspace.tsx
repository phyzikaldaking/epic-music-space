"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DawEngine, type EngineSnapshot, type MidiSynthState, type TrackId } from "./dawEngine";
import { demoPattern, emptyPattern as emptyBeatPattern, renderPatternToBuffer } from "./beatMachine";
import BeatMachineGrid from "./BeatMachineGrid";
import FxPanel from "./FxPanel";
import GearRack, { type GearApplyHandlers } from "./GearRack";
import MasterPanel from "./MasterPanel";
import MasterPublishBar from "./MasterPublishBar";
import MidiPanel from "./MidiPanel";
import PianoRoll from "./PianoRoll";
import ProjectMenu from "./ProjectMenu";
import WaveformView from "./WaveformView";
import {
  deleteProject,
  loadProject,
  newProjectId,
  saveProject,
} from "./projectStorage";

const DEFAULT_TRACKS: Array<{ name: string; color: string; armed: boolean }> = [
  { name: "Vocal", color: "#ec4899", armed: true },
  { name: "Beat", color: "#22d3ee", armed: false },
  { name: "Synth", color: "#a78bfa", armed: false },
  { name: "FX", color: "#f59e0b", armed: false },
];

type FocusMode = "all" | "record" | "arrange" | "mix" | "publish";

type Notice = {
  tone: "info" | "success" | "warning" | "error";
  message: string;
};

type BrowserHealth = {
  webAudio: boolean;
  mediaRecorder: boolean;
  mediaDevices: boolean;
  secureContext: boolean;
};

const FOCUS_MODES: Array<{ id: FocusMode; label: string; detail: string }> = [
  { id: "all", label: "All", detail: "Full board" },
  { id: "record", label: "Record", detail: "Mic + monitor" },
  { id: "arrange", label: "Arrange", detail: "Beat + MIDI" },
  { id: "mix", label: "Mix", detail: "Tracks + sends" },
  { id: "publish", label: "Publish", detail: "Master + catalog" },
];

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function DawWorkspace() {
  const engineRef = useRef<DawEngine | null>(null);
  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  /** Which track FX edits + gear rack presets apply to. */
  const [focusedId, setFocusedId] = useState<TrackId | null>(null);
  /** ID of the dedicated "Beat" track so beat machine renders go there. */
  const [beatTrackId, setBeatTrackId] = useState<TrackId | null>(null);
  const [renderingBeat, setRenderingBeat] = useState(false);
  const [focusMode, setFocusMode] = useState<FocusMode>("all");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [browserHealth, setBrowserHealth] = useState<BrowserHealth | null>(null);
  /** Project save/load — id is generated lazily on first save. */
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Untitled session");
  const [tapFlash, setTapFlash] = useState<number | null>(null);

  useEffect(() => {
    const engine = new DawEngine();
    engineRef.current = engine;
    const unsub = engine.subscribe(() => {
      setSnapshot(engine.getSnapshot());
    });
    return () => {
      unsub();
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    setBrowserHealth({
      webAudio: Boolean(
        window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext,
      ),
      mediaRecorder: typeof MediaRecorder !== "undefined",
      mediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
      secureContext: window.isSecureContext,
    });
  }, []);

  function ensureInit(): boolean {
    const engine = engineRef.current;
    if (!engine) return false;
    if (snapshot) return true;
    const ok = engine.init();
    if (!ok) {
      setInitError("Couldn't start the audio engine — your browser may not support Web Audio.");
      return false;
    }
    let firstId: TrackId | null = null;
    let beatId: TrackId | null = null;
    let synthId: TrackId | null = null;
    for (const t of DEFAULT_TRACKS) {
      const id = engine.addTrack(t.name, t.color);
      if (firstId === null) firstId = id;
      if (t.name === "Beat") beatId = id;
      if (t.name === "Synth") synthId = id;
      if (t.armed) engine.setTrackArmed(id, true);
    }
    if (beatId) {
      engine.setBeatTrack(beatId);
      setBeatTrackId(beatId);
      // Seed a four-on-the-floor demo pattern so a new user has *something*
      // ringing the moment they hit Play with the beat machine on.
      engine.setBeatPattern(demoPattern());
    }
    if (synthId) engine.setSynthTrack(synthId);
    setFocusedId(firstId);
    setSnapshot(engine.getSnapshot());
    return true;
  }

  const transport = snapshot?.transport;
  const tracks = snapshot?.tracks ?? [];
  const beat = snapshot?.beat;
  const showSplash = !snapshot;
  const hasRecordedAudio = tracks.some((track) => track.hasAudio);
  const hasBeatPattern = Boolean(
    beat?.enabled &&
      Object.values(beat.pattern).some((steps) => steps.some(Boolean)),
  );
  const canExport = hasRecordedAudio || hasBeatPattern;
  const emptyExportReason = "Record a track, render a beat, or turn on the beat machine before exporting.";
  const showRecordTools = focusMode === "all" || focusMode === "record" || focusMode === "mix";
  const showArrangeTools = focusMode === "all" || focusMode === "arrange";
  const showMixTools = focusMode === "all" || focusMode === "mix";
  const showPublishTools = focusMode === "all" || focusMode === "publish";
  const focusedTrack = useMemo(
    () => tracks.find((t) => t.id === focusedId) ?? tracks[0] ?? null,
    [tracks, focusedId],
  );

  // ── Project save / load ─────────────────────────────────────────────────
  async function handleSave(name: string) {
    if (!ensureInit()) return;
    const engine = engineRef.current;
    if (!engine) return;
    try {
      const file = await engine.serializeProject();
      const id = projectId ?? newProjectId();
      await saveProject(id, name, file);
      setProjectId(id);
      setProjectName(name);
      setNotice({ tone: "success", message: `Saved "${name}".` });
    } catch (err) {
      console.warn("[DawWorkspace] save failed", err);
      setNotice({ tone: "error", message: "Save failed. Check browser storage settings." });
    }
  }

  async function handleLoad(id: string) {
    if (!ensureInit()) return;
    const engine = engineRef.current;
    if (!engine) return;
    try {
      const file = await loadProject(id);
      if (!file) {
        setNotice({ tone: "error", message: "Saved project not found." });
        return;
      }
      await engine.hydrateProject(file);
      // After hydrate, look up Beat / Synth track ids to keep the React
      // state in sync with the engine's reattached references.
      const snap = engine.getSnapshot();
      const beatT = snap.tracks.find((t) => t.name === "Beat");
      if (beatT) setBeatTrackId(beatT.id);
      setProjectId(id);
      setFocusedId(snap.tracks[0]?.id ?? null);
      setNotice({ tone: "success", message: "Project loaded." });
    } catch (err) {
      console.warn("[DawWorkspace] load failed", err);
      setNotice({ tone: "error", message: "Load failed. The project file may be corrupted." });
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteProject(id);
      if (id === projectId) setProjectId(null);
    } catch (err) {
      console.warn("[DawWorkspace] delete failed", err);
    }
  }

  function handleNew() {
    // Force-reload the workspace into a fresh engine. Cheaper and safer
    // than trying to tear the existing one apart and re-seed it inline —
    // the page reload is instant in dev/prod and discards any in-flight
    // mic streams cleanly.
    if (
      snapshot &&
      tracks.some((t) => t.hasAudio) &&
      !confirm("Discard the current session and start a new project?")
    ) {
      return;
    }
    window.location.reload();
  }

  // ── Tap tempo + keyboard shortcuts ──────────────────────────────────────
  function handleTapTempo() {
    if (!ensureInit()) return;
    const bpm = engineRef.current?.tapTempo();
    if (bpm) {
      setTapFlash(bpm);
      setTimeout(() => setTapFlash(null), 700);
    }
  }

  // Keyboard shortcuts. Only fire when the focus isn't inside an input
  // — otherwise typing a track name would hit the Play hotkey.
  useEffect(() => {
    function key(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const engine = engineRef.current;
      switch (e.key) {
        case " ":
          e.preventDefault();
          if (!ensureInit()) return;
          if (transport?.isPlaying) engine?.stop();
          else void engine?.play();
          break;
        case "r":
        case "R":
          e.preventDefault();
          if (!ensureInit()) return;
          void toggleRecording();
          break;
        case "l":
        case "L":
          if (!ensureInit()) return;
          engine?.setLoopEnabled(!(transport?.loopEnabled ?? false));
          break;
        case "m":
        case "M":
          if (!ensureInit()) return;
          engine?.setMetronome(!(transport?.metronomeOn ?? false));
          break;
        case "t":
        case "T":
          handleTapTempo();
          break;
        case "Home":
          e.preventDefault();
          engine?.rewind();
          break;
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport?.isPlaying, transport?.isRecording, transport?.loopEnabled, transport?.metronomeOn, snapshot]);

  // ── Beat machine helpers ────────────────────────────────────────────────
  async function renderBeatToTrack() {
    const engine = engineRef.current;
    if (!engine || !beatTrackId || !beat || !transport) return;
    setRenderingBeat(true);
    try {
      const buf = await renderPatternToBuffer(beat.pattern, transport.bpm, 1);
      engine.setTrackBuffer(beatTrackId, buf);
      setNotice({ tone: "success", message: "Beat rendered to the Beat track." });
    } catch (err) {
      console.warn("[DawWorkspace] beat render failed", err);
      setNotice({ tone: "error", message: "Beat render failed. Try again after restarting playback." });
    } finally {
      setRenderingBeat(false);
    }
  }

  async function toggleRecording() {
    if (!ensureInit()) return;
    const engine = engineRef.current!;
    if (transport?.isRecording) {
      await engine.stopRecording();
      setNotice({ tone: "success", message: "Recording captured. Review the armed track, then mix or publish." });
      return;
    }
    const currentTracks = snapshot?.tracks ?? [];
    if (currentTracks.length > 0 && !currentTracks.some((track) => track.armed)) {
      setNotice({ tone: "warning", message: "Arm at least one track before recording." });
      return;
    }
    const ok = await engine.startRecording();
    if (!ok) {
      const missingMic = browserHealth && (!browserHealth.mediaDevices || !browserHealth.mediaRecorder);
      setNotice({
        tone: "error",
        message: missingMic
          ? "This browser cannot access mic recording here. Try Chrome or Safari over HTTPS."
          : "Recording could not start. Check mic permission, then try again.",
      });
      return;
    }
    setNotice({ tone: "info", message: "Recording is live. Keep the tab open until you stop." });
  }

  // ── Gear rack: apply preset to focused track ────────────────────────────
  function applyGearPreset(apply: (h: GearApplyHandlers) => void) {
    const engine = engineRef.current;
    if (!engine || !focusedTrack) return;
    const id = focusedTrack.id;
    apply({
      onArm: () => engine.setTrackArmed(id, true),
      onSetEq: (band, db) => engine.setTrackEq(id, band, db),
      onSetComp: (params) => engine.setTrackComp(id, params),
      onSetReverb: (params) => engine.setTrackReverb(id, params),
      onSetDelay: (params) => engine.setTrackDelay(id, params),
    });
  }

  // ── Publish: render mix → WAV → /api/upload signed URL → PUT bytes ──────
  async function publishMix(wav: Blob): Promise<{ ok: boolean; message?: string }> {
    try {
      const fileName = `ems-studio-${Date.now()}.wav`;
      const signRes = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "audio",
          fileName,
          mimeType: "audio/wav",
          fileSize: wav.size,
        }),
      });
      const signJson = (await signRes.json().catch(() => ({}))) as {
        signedUrl?: string;
        publicUrl?: string;
        error?: string;
      };
      if (!signRes.ok || !signJson.signedUrl) {
        return {
          ok: false,
          message: signJson.error ?? `Upload signing failed (${signRes.status}).`,
        };
      }
      const putRes = await fetch(signJson.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": "audio/wav" },
        body: wav,
      });
      if (!putRes.ok) {
        return { ok: false, message: `Storage upload failed (${putRes.status}).` };
      }
      // Hand off to the existing /studio/new flow with the audio URL prefilled.
      const audioUrl = signJson.publicUrl ?? "";
      const target = `/studio/new?audioUrl=${encodeURIComponent(audioUrl)}&from=board`;
      window.location.href = target;
      return { ok: true, message: "Uploaded — finish the details on the next page." };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "Publish failed.",
      };
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-6 overflow-hidden rounded-[1.5rem] border border-white/10 bg-[linear-gradient(135deg,rgba(12,12,20,0.98),rgba(9,16,28,0.94)_46%,rgba(25,13,28,0.9))] p-5 shadow-2xl shadow-black/30">
        <div className="pointer-events-none mb-5 h-24 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
          <div className="flex h-full items-end gap-1 px-4 pb-3 opacity-80">
            {Array.from({ length: 48 }, (_, i) => (
              <span
                key={i}
                className="w-full rounded-t bg-cyan-200/50"
                style={{
                  height: `${18 + Math.abs(Math.sin(i * 0.72)) * 58 + (i % 5) * 3}%`,
                  opacity: 0.22 + (i % 7) * 0.055,
                }}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.32em] text-brand-300/80">
            EMS Studio · Blueprint
          </p>
          <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">Next-gen recording board</h1>
          <p className="mt-1 max-w-xl text-sm text-white/65">
            Send-first FX, adaptive latency, MIDI capture, beat patterns, master render, and
            catalog publishing in one browser-native studio.
          </p>
        </div>
          <div className="flex items-start gap-3">
            <ProjectMenu
              currentProjectId={projectId}
              currentProjectName={projectName}
              onSave={handleSave}
              onLoad={handleLoad}
              onDelete={handleDelete}
              onNew={handleNew}
            />
            <HealthBadge health={browserHealth} />
          </div>
        </div>
      </div>

      <BlueprintStatusPanel ready={!showSplash} />

      <FocusModeBar value={focusMode} onChange={setFocusMode} />

      {initError && (
        <div className="mb-4 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {initError}
        </div>
      )}

      {notice && <StudioNotice notice={notice} onDismiss={() => setNotice(null)} />}

      {/* ── Transport ──────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-gradient-to-r from-[#0c0c14] via-[#0a0a12] to-[#0c0c14] p-4 shadow-inner">
        <button
          type="button"
          onClick={() => {
            if (!ensureInit()) return;
            const engine = engineRef.current!;
            if (transport?.isPlaying) engine.stop();
            else void engine.play();
          }}
          className={`flex h-11 w-11 items-center justify-center rounded-full text-lg font-bold transition ${
            transport?.isPlaying
              ? "bg-white text-black hover:bg-white/90"
              : "bg-brand-500 text-white hover:bg-brand-600"
          }`}
          aria-label={transport?.isPlaying ? "Stop" : "Play"}
        >
          {transport?.isPlaying ? "■" : "▶"}
        </button>

        <button
          type="button"
          onClick={() => {
            if (!ensureInit()) return;
            void toggleRecording();
          }}
          className={`flex h-11 items-center gap-2 rounded-full px-4 text-sm font-bold transition ${
            transport?.isRecording
              ? "bg-red-500 text-white animate-pulse hover:bg-red-600"
              : "border border-red-500/50 text-red-300 hover:bg-red-500/10"
          }`}
          aria-label={transport?.isRecording ? "Stop recording" : "Record"}
        >
          <span className="h-2.5 w-2.5 rounded-full bg-current" />
          {transport?.isRecording ? "Stop rec" : "Record"}
        </button>

        <button
          type="button"
          onClick={() => {
            if (!ensureInit()) return;
            engineRef.current?.rewind();
          }}
          className="flex h-11 items-center gap-2 rounded-full border border-white/15 px-4 text-sm font-semibold text-white/85 hover:bg-white/10 transition"
        >
          ⏮ Rewind
        </button>

        <div className="ml-2 font-mono text-2xl font-extrabold tabular-nums">
          {fmtTime(transport?.positionSec ?? 0)}
        </div>

        <div className="flex-1" />

        <label className="flex items-center gap-2 text-xs font-semibold text-white/70">
          BPM
          <input
            type="number"
            min={40}
            max={240}
            value={transport?.bpm ?? 90}
            onChange={(e) => {
              if (!ensureInit()) return;
              engineRef.current?.setBpm(Number(e.target.value));
            }}
            className="w-16 rounded-md border border-white/15 bg-black/40 px-2 py-1 text-sm font-mono"
          />
        </label>

        <button
          type="button"
          onClick={handleTapTempo}
          className={`rounded-md border px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest transition ${
            tapFlash !== null
              ? "border-accent-400 bg-accent-500/20 text-accent-100"
              : "border-white/15 text-white/65 hover:bg-white/10"
          }`}
          title="Tap to set the BPM (or press T)"
        >
          {tapFlash !== null ? `Tap · ${tapFlash}` : "Tap"}
        </button>

        <button
          type="button"
          onClick={() => {
            if (!ensureInit()) return;
            engineRef.current?.setLoopEnabled(!(transport?.loopEnabled ?? false));
          }}
          className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
            transport?.loopEnabled
              ? "bg-emerald-500 text-black"
              : "border border-white/15 text-white/70 hover:bg-white/10"
          }`}
          title="Loop the region between the start and end markers (L)"
        >
          Loop
        </button>

        {transport?.loopEnabled && (
          <span className="flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-emerald-200">
            <input
              type="number"
              min={0}
              step={0.25}
              value={transport.loopStartSec.toFixed(2)}
              onChange={(e) =>
                engineRef.current?.setLoopRegion(
                  Number(e.target.value),
                  transport.loopEndSec,
                )
              }
              className="w-12 bg-transparent text-right outline-none"
              aria-label="Loop start (seconds)"
            />
            →
            <input
              type="number"
              min={0.25}
              step={0.25}
              value={transport.loopEndSec.toFixed(2)}
              onChange={(e) =>
                engineRef.current?.setLoopRegion(
                  transport.loopStartSec,
                  Number(e.target.value),
                )
              }
              className="w-12 bg-transparent text-right outline-none"
              aria-label="Loop end (seconds)"
            />
            s
          </span>
        )}

        <label className="flex items-center gap-2 text-xs font-semibold text-white/70">
          Latency
          <select
            value={transport?.latencyMode ?? "recording"}
            onChange={(e) => {
              if (!ensureInit()) return;
              engineRef.current?.setLatencyMode(e.target.value as "recording" | "mixing");
            }}
            className="rounded-md border border-white/15 bg-black/40 px-2 py-1 text-sm font-semibold"
            title="Recording favors low monitoring latency; mixing favors smoother playback."
          >
            <option value="recording">Record</option>
            <option value="mixing">Mix</option>
          </select>
        </label>

        <button
          type="button"
          onClick={() => {
            if (!ensureInit()) return;
            engineRef.current?.setMetronome(!(transport?.metronomeOn ?? false));
          }}
          className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
            transport?.metronomeOn
              ? "bg-accent-500 text-black"
              : "border border-white/15 text-white/70 hover:bg-white/10"
          }`}
        >
          Metronome
        </button>

        <MasterStrip
          db={transport?.masterDb ?? 0}
          level={transport?.masterLevel ?? 0}
          onChange={(db) => {
            if (!ensureInit()) return;
            engineRef.current?.setMasterDb(db);
          }}
        />
      </div>

      <p className="-mt-3 mb-6 text-center text-[10px] uppercase tracking-[0.28em] text-white/30">
        Space play · R record · L loop · M metronome · T tap · Home rewind · Drop audio file onto a track to import
      </p>

      {/* ── Track strips ───────────────────────────────────────────────────── */}
      {showRecordTools && <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        {showSplash && (
          <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
            <p className="text-sm font-semibold text-white/80">
              Press Play, Record, or change BPM to start the audio engine.
            </p>
            <p className="mt-1 text-xs text-white/45">
              Browsers require a user gesture before audio can run. Your mic
              won&apos;t turn on until you hit Record.
            </p>
          </div>
        )}

        {!showSplash && (
          <div className="space-y-3">
            {tracks.map((track) => (
              <TrackStrip
                key={track.id}
                track={track}
                focused={track.id === focusedId}
                peaks={track.hasAudio ? engineRef.current?.getWaveformPeaks(track.id, 200) ?? [] : []}
                positionSec={transport?.positionSec ?? 0}
                midiClip={track.name === "Synth" ? snapshot?.midi.clip ?? null : null}
                positionBeats={
                  transport ? (transport.positionSec / 60) * transport.bpm : 0
                }
                sidechainOptions={tracks
                  .filter((other) => other.id !== track.id)
                  .map((other) => ({ id: other.id, name: other.name, color: other.color }))}
                onFocus={() => setFocusedId(track.id)}
                onArm={(armed) => engineRef.current?.setTrackArmed(track.id, armed)}
                onMute={(muted) => engineRef.current?.setTrackMute(track.id, muted)}
                onSolo={(solo) => engineRef.current?.setTrackSolo(track.id, solo)}
                onGain={(db) => engineRef.current?.setTrackGainDb(track.id, db)}
                onPan={(pan) => engineRef.current?.setTrackPan(track.id, pan)}
                onRename={(name) => engineRef.current?.renameTrack(track.id, name)}
                onSetEq={(band, db) => engineRef.current?.setTrackEq(track.id, band, db)}
                onSetComp={(params) => engineRef.current?.setTrackComp(track.id, params)}
                onSetReverb={(params) => engineRef.current?.setTrackReverb(track.id, params)}
                onSetDelay={(params) => engineRef.current?.setTrackDelay(track.id, params)}
                onSetSidechain={(sourceId, amount) =>
                  engineRef.current?.setTrackSidechain(track.id, sourceId, amount)
                }
                onImportFile={async (file) => {
                  const ok = await engineRef.current?.importAudioFile(track.id, file);
                  if (ok) setNotice({ tone: "success", message: `Imported into ${track.name}.` });
                  else setNotice({ tone: "error", message: "Couldn't decode that file." });
                }}
              />
            ))}
          </div>
        )}
      </div>}

      {!showSplash && snapshot && showMixTools && <AuxReturnPanel aux={snapshot.aux} />}

      {/* ── Beat Machine ───────────────────────────────────────────────────── */}
      {!showSplash && beat && showArrangeTools && (
        <div className="mb-6">
          <BeatMachineGrid
            pattern={beat.pattern}
            enabled={beat.enabled}
            activeStep={beat.activeStep}
            activeBank={beat.activeBank}
            kit={beat.kit}
            onToggleStep={(lane, step) => {
              const cur = beat.pattern[lane][step];
              engineRef.current?.setBeatStep(lane, step, !cur);
            }}
            onToggleEnabled={() => engineRef.current?.setBeatEnabled(!beat.enabled)}
            onClear={() => engineRef.current?.setBeatPattern(emptyBeatPattern())}
            onRenderToTrack={renderBeatToTrack}
            onSelectBank={(bank) => engineRef.current?.setActivePatternBank(bank)}
            onSelectKit={(kit) => engineRef.current?.setBeatKit(kit)}
            rendering={renderingBeat}
          />
        </div>
      )}

      {/* ── Gear Rack ──────────────────────────────────────────────────────── */}
      {!showSplash && focusedTrack && showMixTools && (
        <div className="mb-6">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/35">
            Applies to focused track:{" "}
            <span className="text-white/80" style={{ color: focusedTrack.color }}>
              {focusedTrack.name}
            </span>
          </p>
          <GearRack onApplyToTrack={applyGearPreset} />
        </div>
      )}

      {/* ── MIDI Synth ─────────────────────────────────────────────────────── */}
      {!showSplash && snapshot && showArrangeTools && (
        <div className="mb-6">
          <MidiPanel
            state={snapshot.midi}
            onEnableMidi={async () => {
              const result = await engineRef.current?.enableMidi();
              if (result && !result.ok) {
                console.warn("[DawWorkspace] MIDI enable failed:", result.reason);
              }
            }}
            onDisableMidi={() => engineRef.current?.disableMidi()}
            onSetParam={<K extends keyof MidiSynthState>(k: K, v: MidiSynthState[K]) =>
              engineRef.current?.setSynthParam(k, v)
            }
            onNoteOn={(note, velocity) => engineRef.current?.synthNoteOn(note, velocity)}
            onNoteOff={(note) => engineRef.current?.synthNoteOff(note)}
            onPanic={() => engineRef.current?.synthAllNotesOff()}
            onStartClipRec={() => engineRef.current?.startMidiClipRec()}
            onStopClipRec={() => engineRef.current?.stopMidiClipRec()}
            onClearClip={() => engineRef.current?.clearMidiClip()}
          />
        </div>
      )}

      {/* ── Master mastering panel — EQ + spectrum + LUFS ───────────────── */}
      {!showSplash && transport && showPublishTools && (
        <div className="mb-6">
          <MasterPanel
            spectrum={transport.masterSpectrum}
            lufs={transport.masterLufs}
            truePeak={transport.masterTruePeak}
            eqLowDb={transport.masterEqLowDb}
            eqMidDb={transport.masterEqMidDb}
            eqHighDb={transport.masterEqHighDb}
            onSetEq={(band, db) => engineRef.current?.setMasterEq(band, db)}
          />
        </div>
      )}

      {/* ── Master + Publish ───────────────────────────────────────────────── */}
      {!showSplash && transport && showPublishTools && (
        <MasterPublishBar
          limiterOn={transport.masterLimiterOn}
          canExport={canExport}
          emptyReason={emptyExportReason}
          onToggleLimiter={() =>
            engineRef.current?.setMasterLimiter(!transport.masterLimiterOn)
          }
          onExport={async () => {
            const engine = engineRef.current;
            if (!engine) throw new Error("Engine not initialized");
            return engine.exportWav();
          }}
          onPublish={publishMix}
        />
      )}

      {!showSplash && showPublishTools && <CollaborationBlueprintPanel />}

      <p className="mt-6 text-center text-xs text-white/35">
        Phase 1 blueprint live · sequencer, collaboration, and OpenDAW interchange staged next.
      </p>
    </div>
  );
}

function BlueprintStatusPanel({ ready }: { ready: boolean }) {
  const items = [
    ["Send-first FX", "Shared reverb and delay returns reduce duplicate processors."],
    ["Adaptive latency", "Record and mix modes keep the engine honest for the task."],
    ["Cloud handoff", "Rendered WAVs flow into the existing catalog publish path."],
  ];

  return (
    <section className="mb-6 grid gap-3 sm:grid-cols-3">
      {items.map(([label, copy], index) => (
        <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/70">
              {label}
            </p>
            <span
              className={`h-2 w-2 rounded-full ${
                ready || index < 2 ? "bg-emerald-300" : "bg-white/25"
              }`}
            />
          </div>
          <p className="text-xs leading-relaxed text-white/50">{copy}</p>
        </div>
      ))}
    </section>
  );
}

function FocusModeBar({
  value,
  onChange,
}: {
  value: FocusMode;
  onChange: (value: FocusMode) => void;
}) {
  return (
    <div className="mb-6 overflow-x-auto rounded-2xl border border-white/10 bg-black/25 p-1">
      <div className="grid min-w-[680px] grid-cols-5 gap-1">
        {FOCUS_MODES.map((mode) => {
          const selected = value === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => onChange(mode.id)}
              className={`rounded-xl px-3 py-2 text-left transition ${
                selected
                  ? "bg-white text-black"
                  : "text-white/65 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span className="block text-sm font-black">{mode.label}</span>
              <span className="block text-[10px] font-semibold uppercase tracking-widest opacity-60">
                {mode.detail}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HealthBadge({ health }: { health: BrowserHealth | null }) {
  if (!health) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/55">
        Checking engine
      </div>
    );
  }
  const ok = health.webAudio && health.mediaRecorder && health.mediaDevices && health.secureContext;
  const missing = [
    !health.webAudio && "Web Audio",
    !health.mediaRecorder && "Recorder",
    !health.mediaDevices && "Mic",
    !health.secureContext && "Secure context",
  ].filter(Boolean);

  return (
    <div
      className={`rounded-xl border px-3 py-2 text-xs ${
        ok
          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
          : "border-yellow-400/30 bg-yellow-400/10 text-yellow-100"
      }`}
    >
      <div className="flex items-center gap-2 font-black uppercase tracking-widest">
        <span className={`h-2 w-2 rounded-full ${ok ? "bg-emerald-300" : "bg-yellow-300"}`} />
        {ok ? "Engine ready" : "Limited mode"}
      </div>
      {!ok && (
        <p className="mt-1 max-w-[16rem] text-[11px] leading-relaxed opacity-75">
          Missing {missing.join(", ")}. Playback may work, but recording can be limited.
        </p>
      )}
    </div>
  );
}

function StudioNotice({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const toneClass =
    notice.tone === "success"
      ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-100"
      : notice.tone === "warning"
        ? "border-yellow-400/35 bg-yellow-400/10 text-yellow-100"
        : notice.tone === "error"
          ? "border-red-400/35 bg-red-400/10 text-red-100"
          : "border-cyan-400/35 bg-cyan-400/10 text-cyan-100";

  return (
    <div className={`mb-4 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${toneClass}`}>
      <p>{notice.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded-md px-2 text-lg leading-none opacity-70 transition hover:bg-white/10 hover:opacity-100"
        aria-label="Dismiss studio notice"
      >
        ×
      </button>
    </div>
  );
}

function AuxReturnPanel({ aux }: { aux: EngineSnapshot["aux"] }) {
  return (
    <section className="mb-6 rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.04] p-4">
      <header className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.32em] text-cyan-200/85">
            Aux returns
          </p>
          <p className="mt-0.5 text-xs text-white/55">
            Reverb and delay run once as shared busses. Track FX knobs send signal here.
          </p>
        </div>
        <span className="rounded-full border border-cyan-300/25 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-cyan-100/80">
          Send-first
        </span>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <AuxCard
          title="Reverb return"
          value={`${aux.reverbReturn.decaySec.toFixed(1)}s decay`}
          detail={`${Math.round(aux.reverbReturn.level * 100)}% return level`}
        />
        <AuxCard
          title="Delay return"
          value={`${aux.delayReturn.beats.toFixed(3)} beat`}
          detail={`${Math.round(aux.delayReturn.feedback * 100)}% feedback`}
        />
      </div>
    </section>
  );
}

function AuxCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-3">
      <p className="text-sm font-bold text-white/90">{title}</p>
      <p className="mt-1 font-mono text-xs text-cyan-100/80">{value}</p>
      <p className="mt-1 text-[11px] text-white/45">{detail}</p>
    </div>
  );
}

function CollaborationBlueprintPanel() {
  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.32em] text-brand-200/85">
            Collaboration layer
          </p>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-white/55">
            Project comments, presence, version voting, split sheets, and OpenDAW export are
            reserved as the next studio layer so today&apos;s board stays fast and dependable.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-widest text-white/55">
          <span className="rounded-full border border-white/10 px-3 py-1">Presence</span>
          <span className="rounded-full border border-white/10 px-3 py-1">Markers</span>
          <span className="rounded-full border border-white/10 px-3 py-1">Split sheets</span>
        </div>
      </div>
    </section>
  );
}

function MasterStrip({
  db,
  level,
  onChange,
}: {
  db: number;
  level: number;
  onChange: (db: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5">
      <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Master</span>
      <Meter level={level} className="h-1.5 w-16" />
      <input
        type="range"
        min={-60}
        max={6}
        step={0.5}
        value={db}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-24 accent-brand-500"
      />
      <span className="w-10 text-right font-mono text-[11px] tabular-nums text-white/65">
        {db.toFixed(1)}
      </span>
    </div>
  );
}

function TrackStrip({
  track,
  focused,
  peaks,
  positionSec,
  midiClip,
  positionBeats,
  sidechainOptions,
  onFocus,
  onArm,
  onMute,
  onSolo,
  onGain,
  onPan,
  onRename,
  onSetEq,
  onSetComp,
  onSetReverb,
  onSetDelay,
  onSetSidechain,
  onImportFile,
}: {
  track: EngineSnapshot["tracks"][number];
  focused: boolean;
  /** Pre-computed waveform peaks. Empty array = no audio yet. */
  peaks: number[];
  /** Live transport position so the waveform progress overlay updates. */
  positionSec: number;
  /** MIDI clip — only the Synth track has one. null on every other strip. */
  midiClip: import("./dawEngine").MidiClip | null;
  /** Live position in beats for the piano-roll playhead. */
  positionBeats: number;
  /** Other tracks selectable as a sidechain source. */
  sidechainOptions: { id: TrackId; name: string; color: string }[];
  onFocus: () => void;
  onArm: (armed: boolean) => void;
  onMute: (muted: boolean) => void;
  onSolo: (solo: boolean) => void;
  onGain: (db: number) => void;
  onPan: (pan: number) => void;
  onRename: (name: string) => void;
  onSetEq: (band: "low" | "mid" | "high", db: number) => void;
  onSetComp: (params: { threshDb?: number; ratio?: number; enabled?: boolean }) => void;
  onSetReverb: (params: { wet?: number; decaySec?: number }) => void;
  onSetDelay: (params: { wet?: number; beats?: number; feedback?: number }) => void;
  onSetSidechain: (sourceId: TrackId | null, amount?: number) => void;
  onImportFile: (file: Blob) => void;
}) {
  const accent = useMemo(
    () => ({ "--track-color": track.color }) as React.CSSProperties,
    [track.color],
  );
  const [dragging, setDragging] = useState(false);

  const progress = track.durationSec > 0 ? positionSec / track.durationSec : 0;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer?.files?.[0];
        if (file) onImportFile(file);
      }}
      className={`relative rounded-xl border p-3 transition ${
        dragging
          ? "border-brand-400 bg-brand-500/10"
          : focused
            ? "border-white/25 bg-gradient-to-r from-white/[0.07] to-cyan-400/[0.04]"
            : "border-white/10 bg-gradient-to-r from-white/[0.04] to-transparent"
      }`}
      style={accent}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-brand-500/10 text-xs font-bold uppercase tracking-widest text-brand-200">
          Drop audio file to import
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-[minmax(160px,220px)_auto_minmax(260px,1fr)] lg:items-center">
        <div
          className="flex min-w-0 items-center gap-3 rounded-lg transition hover:bg-white/[0.04]"
          onClick={onFocus}
        >
          <div className="h-12 w-1.5 shrink-0 rounded-full" style={{ background: "var(--track-color)" }} />

          <div className="min-w-0">
            <input
              type="text"
              value={track.name}
              onChange={(e) => onRename(e.target.value)}
              maxLength={24}
              className="w-full bg-transparent text-sm font-bold text-white/95 outline-none focus:bg-white/[0.06] rounded px-1 -mx-1"
              aria-label="Track name"
            />
            <p className="text-[10px] text-white/40">
              {track.hasAudio ? `${track.durationSec.toFixed(1)}s recorded` : "Empty"}
              {focused && " · focused"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onArm(!track.armed)}
          className={`min-h-8 rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-widest transition ${
            track.armed
              ? "bg-red-500 text-white"
              : "border border-red-500/40 text-red-300 hover:bg-red-500/10"
          }`}
          title="Arm track for recording"
        >
          ●
        </button>

        <button
          type="button"
          onClick={() => onMute(!track.muted)}
          className={`min-h-8 rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-widest transition ${
            track.muted
              ? "bg-white/85 text-black"
              : "border border-white/15 text-white/70 hover:bg-white/10"
          }`}
        >
          M
        </button>

        <button
          type="button"
          onClick={() => onSolo(!track.solo)}
          className={`min-h-8 rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-widest transition ${
            track.solo
              ? "bg-yellow-400 text-black"
              : "border border-white/15 text-white/70 hover:bg-white/10"
          }`}
        >
          S
        </button>

          <Meter level={track.level} className="h-2 w-24" />
        </div>

        <div className="grid gap-2 sm:grid-cols-[minmax(120px,160px)_minmax(180px,1fr)] sm:items-center">
          <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/50">
            Pan
            <input
              type="range"
              min={-1}
              max={1}
              step={0.05}
              value={track.pan}
              onChange={(e) => onPan(Number(e.target.value))}
              className="w-full accent-accent-500"
            />
          </label>

          <label className="flex flex-1 items-center gap-2 text-[10px] uppercase tracking-wider text-white/50">
            Gain
            <input
              type="range"
              min={-60}
              max={6}
              step={0.5}
              value={track.gainDb}
              onChange={(e) => onGain(Number(e.target.value))}
              className="flex-1 accent-brand-500"
            />
            <span className="w-10 text-right font-mono text-[10px] tabular-nums text-white/65">
              {track.gainDb.toFixed(1)}
            </span>
          </label>
        </div>
      </div>

      {peaks.length > 0 && (
        <div className="mt-3">
          <WaveformView peaks={peaks} color={track.color} progress={progress} />
        </div>
      )}

      {midiClip && (
        <div className="mt-3">
          <PianoRoll clip={midiClip} color={track.color} positionBeats={positionBeats} />
        </div>
      )}

      <FxPanel
        fx={track.fx}
        sidechainFromId={track.sidechainFromId}
        sidechainAmount={track.sidechainAmount}
        sidechainOptions={sidechainOptions}
        onSetEq={onSetEq}
        onSetComp={onSetComp}
        onSetReverb={onSetReverb}
        onSetDelay={onSetDelay}
        onSetSidechain={onSetSidechain}
      />
    </div>
  );
}

function Meter({ level, className = "" }: { level: number; className?: string }) {
  const w = Math.min(1, Math.pow(level, 0.5));
  const hue = level > 0.95 ? 0 : level > 0.75 ? 50 : 130;
  return (
    <div className={`overflow-hidden rounded-full bg-white/10 ${className}`}>
      <div
        className="h-full transition-[width,background] duration-75"
        style={{
          width: `${(w * 100).toFixed(1)}%`,
          background: `hsl(${hue}, 80%, 55%)`,
        }}
      />
    </div>
  );
}
