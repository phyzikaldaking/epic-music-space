"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  listProjects,
  loadProject,
  newProjectId,
  saveProject,
} from "./projectStorage";
import { CHANNELS, createBrowserSupabaseClient } from "@/lib/supabase";
import { useSession } from "next-auth/react";

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

type SessionStats = {
  takes: number;
  imports: number;
  beatRenders: number;
  exports: number;
  publishes: number;
};

type CollaboratorPresence = {
  id: string;
  name: string;
  focusMode: FocusMode;
  isPlaying: boolean;
  updatedAt: string;
};

type VersionEntry = {
  id: string;
  name: string;
  savedAt: string;
};

type StudioAuditEvent = {
  id: string;
  at: number;
  kind: "save" | "load" | "autosave" | "record" | "import" | "beat" | "export" | "publish";
  detail: string;
};

const FOCUS_MODES: Array<{ id: FocusMode; label: string; detail: string }> = [
  { id: "all", label: "All", detail: "Full board" },
  { id: "record", label: "Record", detail: "Mic + monitor" },
  { id: "arrange", label: "Arrange", detail: "Beat + MIDI" },
  { id: "mix", label: "Mix", detail: "Tracks + sends" },
  { id: "publish", label: "Publish", detail: "Master + catalog" },
];

const VIS_BAR_HEIGHT_CLASSES = [
  "h-[18%]",
  "h-[24%]",
  "h-[32%]",
  "h-[40%]",
  "h-[48%]",
  "h-[56%]",
  "h-[64%]",
  "h-[72%]",
  "h-[80%]",
  "h-[88%]",
];

const VIS_BAR_OPACITY_CLASSES = [
  "opacity-25",
  "opacity-30",
  "opacity-35",
  "opacity-40",
  "opacity-45",
  "opacity-50",
  "opacity-55",
];

const METER_WIDTH_CLASSES = [
  "w-[0%]",
  "w-[5%]",
  "w-[10%]",
  "w-[15%]",
  "w-[20%]",
  "w-[25%]",
  "w-[30%]",
  "w-[35%]",
  "w-[40%]",
  "w-[45%]",
  "w-[50%]",
  "w-[55%]",
  "w-[60%]",
  "w-[65%]",
  "w-[70%]",
  "w-[75%]",
  "w-[80%]",
  "w-[85%]",
  "w-[90%]",
  "w-[95%]",
  "w-[100%]",
];

function trackTextClass(color: string): string {
  switch (color.toLowerCase()) {
    case "#ec4899":
      return "text-pink-300";
    case "#22d3ee":
      return "text-cyan-300";
    case "#a78bfa":
      return "text-violet-300";
    case "#f59e0b":
      return "text-amber-300";
    default:
      return "text-white/80";
  }
}

function trackBgClass(color: string): string {
  switch (color.toLowerCase()) {
    case "#ec4899":
      return "bg-pink-400";
    case "#22d3ee":
      return "bg-cyan-400";
    case "#a78bfa":
      return "bg-violet-400";
    case "#f59e0b":
      return "bg-amber-400";
    default:
      return "bg-white/60";
  }
}

function meterWidthClass(level: number): string {
  const normalized = Math.min(1, Math.pow(Math.max(0, level), 0.5));
  const idx = Math.max(0, Math.min(20, Math.round(normalized * 20)));
  return METER_WIDTH_CLASSES[idx];
}

function meterToneClass(level: number): string {
  if (level > 0.95) return "bg-red-500";
  if (level > 0.75) return "bg-yellow-400";
  return "bg-emerald-400";
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function DawWorkspace() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  /** Song id to import as 4 stem tracks (passed by /track/[id] "Open in Studio"). */
  const stemsSongId = searchParams.get("stems");
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
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [sessionNotes, setSessionNotes] = useState("");
  const [notesSavedAt, setNotesSavedAt] = useState<number | null>(null);
  const [stats, setStats] = useState<SessionStats>({
    takes: 0,
    imports: 0,
    beatRenders: 0,
    exports: 0,
    publishes: 0,
  });
  const [collaborators, setCollaborators] = useState<CollaboratorPresence[]>([]);
  const [presenceConnected, setPresenceConnected] = useState(false);
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [autosaveOn, setAutosaveOn] = useState(true);
  const [lastAutosaveAt, setLastAutosaveAt] = useState<number | null>(null);
  const [postingForum, setPostingForum] = useState(false);
  const [auditEvents, setAuditEvents] = useState<StudioAuditEvent[]>([]);
  const sessionStartedAt = useRef<number>(Date.now());
  const clientPresenceId = useMemo(() => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
    return `studio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }, []);

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

  // Hold the latest focus mode + display name in refs so the presence
  // channel can read them without being a useEffect dependency. Without
  // this, every focusMode toggle would tear down + recreate the WebSocket
  // subscription, causing collaborators to see "leave + rejoin" flicker.
  const focusModeRef = useRef(focusMode);
  const displayNameRef = useRef(session?.user?.name?.trim() || "Studio creator");
  useEffect(() => {
    focusModeRef.current = focusMode;
  }, [focusMode]);
  useEffect(() => {
    displayNameRef.current = session?.user?.name?.trim() || "Studio creator";
  }, [session?.user?.name]);

  // Hold the channel itself in a ref so we can re-track() on focus-mode
  // changes without remounting the subscription.
  const presenceChannelRef = useRef<ReturnType<NonNullable<ReturnType<typeof createBrowserSupabaseClient>>["channel"]> | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;
    const channel = supabase.channel(`${CHANNELS.marketplace}:studio-board`, {
      config: { presence: { key: clientPresenceId } },
    });
    presenceChannelRef.current = channel;
    const update = () => {
      const state = channel.presenceState() as Record<string, CollaboratorPresence[]>;
      const next = Object.values(state).flat();
      setCollaborators(next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    };
    channel.on("presence", { event: "sync" }, update);
    channel.on("presence", { event: "join" }, update);
    channel.on("presence", { event: "leave" }, update);
    channel.subscribe(async (status) => {
      setPresenceConnected(status === "SUBSCRIBED");
      if (status === "SUBSCRIBED") {
        await channel.track({
          id: clientPresenceId,
          name: displayNameRef.current,
          focusMode: focusModeRef.current,
          isPlaying: false,
          updatedAt: new Date().toISOString(),
        } satisfies CollaboratorPresence);
      }
    });
    return () => {
      presenceChannelRef.current = null;
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [clientPresenceId]);

  // When focusMode changes, re-track presence on the live channel
  // without recreating it.
  useEffect(() => {
    const channel = presenceChannelRef.current;
    if (!channel) return;
    void channel.track({
      id: clientPresenceId,
      name: displayNameRef.current,
      focusMode,
      isPlaying: false,
      updatedAt: new Date().toISOString(),
    } satisfies CollaboratorPresence);
  }, [focusMode, clientPresenceId]);

  useEffect(() => {
    void listProjects()
      .then((items) => {
        const scoped = items
          .filter((p) => p.name.includes("[v"))
          .slice(0, 8)
          .map((p) => ({ id: p.id, name: p.name, savedAt: p.savedAt }));
        setVersions(scoped);
      })
      .catch(() => setVersions([]));
  }, [projectId, lastAutosaveAt]);

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

  useEffect(() => {
    const key = "ems-studio-guide-dismissed-v1";
    const dismissed = typeof window !== "undefined" ? localStorage.getItem(key) : null;
    setShowGuide(dismissed !== "1");
  }, []);

  useEffect(() => {
    const key = "ems-studio-session-notes-v1";
    const saved = typeof window !== "undefined" ? localStorage.getItem(key) : null;
    if (saved) setSessionNotes(saved);
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

  // ── Stems handoff ───────────────────────────────────────────────────────
  // When the DAW is opened with `?stems=<songId>` (from a track page's
  // "Open in Studio" button), we boot the engine, replace the default
  // tracks with Vocals/Drums/Bass/Other, and decode each Demucs output
  // into its track. The user lands on a remix-ready board.
  const stemsLoadedRef = useRef(false);
  useEffect(() => {
    if (!stemsSongId || stemsLoadedRef.current) return;
    stemsLoadedRef.current = true;

    void (async () => {
      const ok = ensureInit();
      if (!ok) return;
      const engine = engineRef.current;
      if (!engine) return;

      try {
        const res = await fetch(`/api/songs/${stemsSongId}/stems`, {
          cache: "no-store",
        });
        if (!res.ok) {
          setNotice({
            tone: "error",
            message:
              res.status === 403
                ? "You need a license to this track to load its stems."
                : `Couldn't load stems (${res.status}).`,
          });
          return;
        }
        const data = (await res.json()) as {
          status: string;
          stems?: { vocals: string; drums: string; bass: string; other: string };
        };
        if (data.status !== "READY" || !data.stems) {
          setNotice({
            tone: "warning",
            message: "Stems aren't ready yet — check back from the track page.",
          });
          return;
        }

        const palette: Record<keyof typeof data.stems, { name: string; color: string }> = {
          vocals: { name: "Vocals", color: "#ec4899" },
          drums: { name: "Drums", color: "#22d3ee" },
          bass: { name: "Bass", color: "#a78bfa" },
          other: { name: "Other", color: "#f59e0b" },
        };

        const order: (keyof typeof data.stems)[] = ["vocals", "drums", "bass", "other"];
        let firstNewId: TrackId | null = null;
        for (const kind of order) {
          const url = data.stems[kind];
          const meta = palette[kind];
          const trackId = engine.addTrack(meta.name, meta.color);
          if (firstNewId === null) firstNewId = trackId;
          try {
            const blob = await (await fetch(url)).blob();
            await engine.importAudioFile(trackId, blob);
          } catch (err) {
            console.warn(`[DawWorkspace] stem load failed for ${kind}`, err);
          }
        }
        if (firstNewId) setFocusedId(firstNewId);
        setSnapshot(engine.getSnapshot());
        setNotice({
          tone: "success",
          message: "4 stems loaded — solo a track to mute the others, then remix.",
        });
      } catch (err) {
        console.warn("[DawWorkspace] stems handoff failed", err);
        setNotice({ tone: "error", message: "Couldn't load stems. Try again from the track page." });
      }
    })();
    // ensureInit is stable for the lifetime of the component (it reads
    // engineRef + snapshot via closure, both refs of state we own). Adding
    // it to deps would re-fire the effect every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stemsSongId]);

  const transport = snapshot?.transport;
  const tracks = useMemo(() => snapshot?.tracks ?? [], [snapshot]);
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

  const pushAuditEvent = useCallback((kind: StudioAuditEvent["kind"], detail: string) => {
    const entry: StudioAuditEvent = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      at: Date.now(),
      kind,
      detail,
    };
    setAuditEvents((prev) => [entry, ...prev].slice(0, 24));
  }, []);

  // ── Project save / load ─────────────────────────────────────────────────
  async function handleSave(name: string) {
    if (!ensureInit()) return;
    const engine = engineRef.current;
    if (!engine) return;
    try {
      const file = await engine.serializeProject();
      const id = projectId ?? newProjectId();
      await saveProject(id, name, file);
      const versionId = `${id}__v_${Date.now()}`;
      await saveProject(versionId, `${name} [v${new Date().toLocaleTimeString()}]`, file);
      setProjectId(id);
      setProjectName(name);
      pushAuditEvent("save", `Saved "${name}"`);
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
      pushAuditEvent("load", `Loaded project ${id.slice(0, 8)}`);
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

  const createAutosaveVersion = useCallback(async () => {
    if (!autosaveOn) return;
    const engine = engineRef.current;
    if (!engine) return;
    try {
      const file = await engine.serializeProject();
      const id = projectId ?? newProjectId();
      const name = projectName.trim() || "Untitled session";
      await saveProject(id, name, file);
      const versionId = `${id}__v_${Date.now()}`;
      await saveProject(versionId, `${name} [v${new Date().toLocaleTimeString()}]`, file);
      if (!projectId) setProjectId(id);
      setLastAutosaveAt(Date.now());
      pushAuditEvent("autosave", `Autosaved "${name}"`);
    } catch {
      // Silent on autosave failures to avoid interrupting recording flow.
    }
  }, [autosaveOn, projectId, projectName, pushAuditEvent]);

  useEffect(() => {
    if (!autosaveOn) return;
    const timer = window.setInterval(() => {
      void createAutosaveVersion();
    }, 45000);
    return () => window.clearInterval(timer);
  }, [autosaveOn, createAutosaveVersion]);

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
        case "?":
          e.preventDefault();
          setShowShortcuts((v) => !v);
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
      setStats((s) => ({ ...s, beatRenders: s.beatRenders + 1 }));
      pushAuditEvent("beat", "Rendered beat pattern to Beat track");
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
      setStats((s) => ({ ...s, takes: s.takes + 1 }));
      pushAuditEvent("record", "Captured new recording take");
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
      // Use router.push so the SPA stays mounted briefly and we don't tear
      // down the engine/IndexedDB save while it's still flushing.
      const audioUrl = signJson.publicUrl ?? "";
      const target = `/studio/new?audioUrl=${encodeURIComponent(audioUrl)}&from=board`;
      setStats((s) => ({ ...s, publishes: s.publishes + 1 }));
      pushAuditEvent("publish", "Uploaded mix and moved to publish flow");
      router.push(target);
      return { ok: true, message: "Uploaded — finish the details on the next page." };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "Publish failed.",
      };
    }
  }

  async function postPreviewToForum() {
    if (!ensureInit()) return;
    const engine = engineRef.current;
    if (!engine) return;
    setPostingForum(true);
    try {
      const wav = await engine.exportWav();
      const fileName = `ems-studio-preview-${Date.now()}.wav`;
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
      if (!signRes.ok || !signJson.signedUrl || !signJson.publicUrl) {
        throw new Error(signJson.error ?? "Could not prepare forum preview upload.");
      }
      const putRes = await fetch(signJson.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": "audio/wav" },
        body: wav,
      });
      if (!putRes.ok) throw new Error(`Preview upload failed (${putRes.status}).`);

      const previewUrl = signJson.publicUrl;
      const body = [
        `Studio drop: ${projectName}`,
        `Preview clip: ${previewUrl}`,
        `Session stats — takes ${stats.takes}, imports ${stats.imports}, beat renders ${stats.beatRenders}.`,
        "#StudioDrop #WIP",
      ].join("\n");
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Forum post failed.");
      }
      pushAuditEvent("publish", "Posted preview clip to forum timeline");
      setNotice({ tone: "success", message: "Posted to forum timeline with preview clip." });
    } catch (err) {
      setNotice({
        tone: "error",
        message: err instanceof Error ? err.message : "Could not post preview to forum.",
      });
    } finally {
      setPostingForum(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-[calc(env(safe-area-inset-bottom)+5rem)] sm:py-8">
      {showGuide && (
        <QuickStartGuide
          onClose={() => {
            setShowGuide(false);
            localStorage.setItem("ems-studio-guide-dismissed-v1", "1");
          }}
        />
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-6 overflow-hidden rounded-[1.5rem] border border-white/10 bg-[linear-gradient(135deg,rgba(12,12,20,0.98),rgba(9,16,28,0.94)_46%,rgba(25,13,28,0.9))] p-5 shadow-2xl shadow-black/30">
        <div className="pointer-events-none mb-5 h-24 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
          <div className="flex h-full items-end gap-1 px-4 pb-3 opacity-80">
            {Array.from({ length: 48 }, (_, i) => (
              <span
                key={i}
                className={`w-full rounded-t bg-cyan-200/50 ${VIS_BAR_HEIGHT_CLASSES[i % VIS_BAR_HEIGHT_CLASSES.length]} ${VIS_BAR_OPACITY_CLASSES[i % VIS_BAR_OPACITY_CLASSES.length]}`}
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
      {!showSplash && (
        <StudioExecutionBar
          onTemplate={(preset) => {
            if (!ensureInit()) return;
            if (preset === "vocal") {
              engineRef.current?.setBpm(92);
              setFocusMode("record");
              pushAuditEvent("record", "Loaded Vocal template (92 BPM)");
              return;
            }
            if (preset === "club") {
              engineRef.current?.setBpm(128);
              engineRef.current?.setBeatEnabled(true);
              setFocusMode("arrange");
              pushAuditEvent("beat", "Loaded Club template (128 BPM + beat enabled)");
              return;
            }
            engineRef.current?.setBpm(72);
            setFocusMode("mix");
            pushAuditEvent("export", "Loaded Master template (72 BPM)");
          }}
          onForum={() => router.push("/forum")}
        />
      )}

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

      {!showSplash && (
        <div className="mb-5 grid gap-2 sm:grid-cols-4">
          <StatusPill
            label="Armed Tracks"
            value={`${tracks.filter((t) => t.armed).length}`}
            tone={tracks.some((t) => t.armed) ? "ok" : "warn"}
          />
          <StatusPill
            label="Latency Mode"
            value={transport?.latencyMode === "mixing" ? "Mix" : "Record"}
            tone="neutral"
          />
          <StatusPill
            label="Loop Region"
            value={transport?.loopEnabled ? `${transport.loopStartSec.toFixed(2)}s → ${transport.loopEndSec.toFixed(2)}s` : "Off"}
            tone={transport?.loopEnabled ? "ok" : "neutral"}
          />
          <button
            type="button"
            onClick={() => setShowShortcuts(true)}
            className="rounded-xl border border-white/12 bg-white/[0.03] px-3 py-2 text-left transition hover:bg-white/[0.07]"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">Shortcuts</p>
            <p className="mt-1 text-sm font-semibold text-white">Press <span className="font-mono">?</span> to view all</p>
          </button>
        </div>
      )}

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
                  if (ok) {
                    setStats((s) => ({ ...s, imports: s.imports + 1 }));
                    pushAuditEvent("import", `Imported audio into ${track.name}`);
                    setNotice({ tone: "success", message: `Imported into ${track.name}.` });
                  }
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
            <span className={trackTextClass(focusedTrack.color)}>
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
            const wav = await engine.exportWav();
            setStats((s) => ({ ...s, exports: s.exports + 1 }));
            pushAuditEvent("export", "Exported WAV mixdown");
            return wav;
          }}
          onPublish={publishMix}
        />
      )}

      {!showSplash && showPublishTools && (
        <CollaborationPresencePanel
          collaborators={collaborators}
          connected={presenceConnected}
          autosaveOn={autosaveOn}
          onToggleAutosave={() => setAutosaveOn((v) => !v)}
          lastAutosaveAt={lastAutosaveAt}
          versions={versions}
          onRestoreVersion={handleLoad}
          onPublishForum={postPreviewToForum}
          postingForum={postingForum}
          canPost={canExport}
          auditEvents={auditEvents}
        />
      )}

      {!showSplash && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <SessionNotesPanel
            value={sessionNotes}
            onChange={(next) => {
              setSessionNotes(next);
              localStorage.setItem("ems-studio-session-notes-v1", next);
            }}
            onSave={() => setNotesSavedAt(Date.now())}
            savedAt={notesSavedAt}
          />
          <SessionAnalyticsPanel
            stats={stats}
            elapsedMin={Math.max(1, Math.round((Date.now() - sessionStartedAt.current) / 60000))}
          />
        </div>
      )}

      <p className="mt-6 text-center text-xs text-white/35">
        Studio board now includes live presence, autosave versioning, and one-click forum preview publishing.
      </p>

      {showShortcuts && (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-black/70 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Studio keyboard shortcuts"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#0d0f1a] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-extrabold">Studio Shortcuts</h2>
              <button
                type="button"
                onClick={() => setShowShortcuts(false)}
                className="rounded-md border border-white/15 px-2 py-1 text-xs text-white/70 hover:bg-white/10"
              >
                Close
              </button>
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <ShortcutRow combo="Space" action="Play / Stop" />
              <ShortcutRow combo="R" action="Record / Stop record" />
              <ShortcutRow combo="L" action="Toggle loop mode" />
              <ShortcutRow combo="M" action="Toggle metronome" />
              <ShortcutRow combo="T" action="Tap tempo" />
              <ShortcutRow combo="Home" action="Rewind to start" />
              <ShortcutRow combo="?" action="Toggle this help panel" />
            </div>
          </div>
        </div>
      )}
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

function StudioExecutionBar({
  onTemplate,
  onForum,
}: {
  onTemplate: (preset: "vocal" | "club" | "master") => void;
  onForum: () => void;
}) {
  return (
    <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[10px] font-black uppercase tracking-[0.2em] text-white/55">Fast launch</span>
        <button type="button" onClick={() => onTemplate("vocal")} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10">Vocal template</button>
        <button type="button" onClick={() => onTemplate("club")} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10">Club template</button>
        <button type="button" onClick={() => onTemplate("master")} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10">Master template</button>
        <button type="button" onClick={onForum} className="ml-auto rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-white hover:bg-brand-600">Open forum timeline</button>
      </div>
    </section>
  );
}

function StatusPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ok" | "warn" | "neutral";
}) {
  const toneClass =
    tone === "ok"
      ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
      : tone === "warn"
        ? "border-amber-400/25 bg-amber-500/10 text-amber-100"
        : "border-white/12 bg-white/[0.03] text-white/85";

  return (
    <div className={`rounded-xl border px-3 py-2 ${toneClass}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function ShortcutRow({ combo, action }: { combo: string; action: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
      <span className="font-mono text-xs font-bold text-cyan-200">{combo}</span>
      <span className="text-xs text-white/75">{action}</span>
    </div>
  );
}

function QuickStartGuide({ onClose }: { onClose: () => void }) {
  return (
    <section className="mb-5 rounded-2xl border border-cyan-300/25 bg-cyan-400/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-100/85">First session guide</p>
          <h2 className="mt-1 text-base font-extrabold text-white">Fastest path to a publish-ready session</h2>
          <p className="mt-1 text-sm text-white/70">1) Press play to initialize. 2) Record a take or render beat. 3) Export or publish.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-cyan-200/35 px-3 py-1.5 text-xs font-bold text-cyan-100 hover:bg-cyan-300/15"
        >
          Dismiss
        </button>
      </div>
    </section>
  );
}

function SessionNotesPanel({
  value,
  onChange,
  onSave,
  savedAt,
}: {
  value: string;
  onChange: (next: string) => void;
  onSave: () => void;
  savedAt: number | null;
}) {
  return (
    <section className="rounded-2xl border border-white/12 bg-white/[0.03] p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/75">Session Notes</p>
        <button
          type="button"
          onClick={onSave}
          className="rounded-md border border-white/15 px-2.5 py-1 text-xs font-semibold text-white/75 hover:bg-white/10"
        >
          Save note
        </button>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Arrangement ideas, mix tweaks, artist notes, collab handoff..."
        className="min-h-28 w-full resize-y rounded-xl border border-white/12 bg-black/35 p-3 text-sm text-white placeholder:text-white/35 focus:border-brand-500/50 focus:outline-none"
      />
      <p className="mt-2 text-[11px] text-white/45">
        {savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString()}` : "Notes persist locally for this browser."}
      </p>
    </section>
  );
}

function SessionAnalyticsPanel({ stats, elapsedMin }: { stats: SessionStats; elapsedMin: number }) {
  const pace = (n: number) => (elapsedMin > 0 ? (n / elapsedMin).toFixed(2) : "0.00");
  return (
    <section className="rounded-2xl border border-white/12 bg-white/[0.03] p-4">
      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/75">Session Analytics</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <MetricCell label="Takes" value={String(stats.takes)} />
        <MetricCell label="Imports" value={String(stats.imports)} />
        <MetricCell label="Beat renders" value={String(stats.beatRenders)} />
        <MetricCell label="Exports" value={String(stats.exports)} />
        <MetricCell label="Publishes" value={String(stats.publishes)} />
        <MetricCell label="Elapsed" value={`${elapsedMin}m`} />
      </div>
      <p className="mt-2 text-[11px] text-white/45">
        Workflow pace: {pace(stats.takes + stats.imports + stats.beatRenders)} productive actions/min.
      </p>
    </section>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
      <p className="text-[10px] uppercase tracking-widest text-white/45">{label}</p>
      <p className="mt-1 text-sm font-bold text-white">{value}</p>
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

function CollaborationPresencePanel({
  collaborators,
  connected,
  autosaveOn,
  onToggleAutosave,
  lastAutosaveAt,
  versions,
  onRestoreVersion,
  onPublishForum,
  postingForum,
  canPost,
  auditEvents,
}: {
  collaborators: CollaboratorPresence[];
  connected: boolean;
  autosaveOn: boolean;
  onToggleAutosave: () => void;
  lastAutosaveAt: number | null;
  versions: VersionEntry[];
  onRestoreVersion: (id: string) => Promise<void>;
  onPublishForum: () => Promise<void>;
  postingForum: boolean;
  canPost: boolean;
  auditEvents: StudioAuditEvent[];
}) {
  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-black/25 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-200/85">Collaboration</p>
            <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-300" : "bg-white/30"}`} />
          </div>
          <p className="text-sm font-semibold text-white">{connected ? `${collaborators.length} active` : "Presence standby"}</p>
          <ul className="mt-2 space-y-1">
            {collaborators.slice(0, 4).map((c) => (
              <li key={`${c.id}-${c.updatedAt}`} className="rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1.5 text-xs text-white/75">
                {c.name} · {c.focusMode} · {c.isPlaying ? "playing" : "paused"}
              </li>
            ))}
            {collaborators.length === 0 && (
              <li className="text-xs text-white/45">Open this board in another tab/device to see presence live.</li>
            )}
          </ul>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/25 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-200/85">Version history</p>
            <button
              type="button"
              onClick={onToggleAutosave}
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${
                autosaveOn ? "bg-emerald-400 text-black" : "border border-white/15 text-white/70"
              }`}
            >
              {autosaveOn ? "Autosave on" : "Autosave off"}
            </button>
          </div>
          <p className="text-xs text-white/45">
            {lastAutosaveAt ? `Last autosave ${new Date(lastAutosaveAt).toLocaleTimeString()}` : "Autosave runs every 45s while active."}
          </p>
          <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto">
            {versions.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => void onRestoreVersion(v.id)}
                  className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1.5 text-left text-xs text-white/80 hover:bg-white/[0.06]"
                >
                  <p className="truncate">{v.name}</p>
                  <p className="text-[10px] text-white/45">{new Date(v.savedAt).toLocaleString()}</p>
                </button>
              </li>
            ))}
            {versions.length === 0 && <li className="text-xs text-white/45">No saved versions yet.</li>}
          </ul>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/25 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-200/85">Forum publish</p>
          <p className="mt-2 text-xs text-white/55">
            One-click post uploads a WAV preview and publishes to the forum timeline.
          </p>
          <button
            type="button"
            onClick={() => void onPublishForum()}
            disabled={!canPost || postingForum}
            className="mt-3 w-full rounded-lg bg-brand-500 px-3 py-2 text-xs font-bold uppercase tracking-widest text-white hover:bg-brand-600 disabled:opacity-40"
            title={canPost ? "Export preview and post to forum timeline" : "Record or render first to publish a preview"}
          >
            {postingForum ? "Posting..." : "Post preview to forum"}
          </button>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/25 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-200/85">Session audit</p>
          <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto">
            {auditEvents.map((e) => (
              <li key={e.id} className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-1 text-[11px] text-white/75">
                <span className="font-mono text-white/50">{new Date(e.at).toLocaleTimeString()}</span> · {e.kind} · {e.detail}
              </li>
            ))}
            {auditEvents.length === 0 && <li className="text-xs text-white/45">No actions logged yet.</li>}
          </ul>
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
        title="Master gain"
        aria-label="Master gain"
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
          <div className={`h-12 w-1.5 shrink-0 rounded-full ${trackBgClass(track.color)}`} />

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

        <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => onArm(!track.armed)}
          className={`min-h-9 min-w-9 rounded-md px-2.5 py-1.5 text-[11px] font-black uppercase tracking-widest transition ${
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
          className={`min-h-9 min-w-9 rounded-md px-2.5 py-1.5 text-[11px] font-black uppercase tracking-widest transition ${
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
          className={`min-h-9 min-w-9 rounded-md px-2.5 py-1.5 text-[11px] font-black uppercase tracking-widest transition ${
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
  const widthClass = meterWidthClass(level);
  const toneClass = meterToneClass(level);
  return (
    <div className={`overflow-hidden rounded-full bg-white/10 ${className}`}>
      <div className={`h-full ${widthClass} ${toneClass} transition-[width,background] duration-75`} />
    </div>
  );
}
