"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type AuxBusState,
  type BeatMachineState,
  DawEngine,
  type EngineSnapshot,
  type MidiSynthState,
  type TrackState,
  type TrackId,
  type TransportState,
} from "./dawEngine";
import {
  DRUM_LANES,
  STEPS,
  demoPattern,
  emptyPattern as emptyBeatPattern,
  renderPatternToBuffer,
  trapDemoPattern,
  type BeatPattern,
  type DrumKind,
  type DrumKitId,
} from "./beatMachine";
import BeatMachineGrid from "./BeatMachineGrid";
import FxPanel from "./FxPanel";
import GearRack, { type GearApplyHandlers } from "./GearRack";
import MasterPublishBar from "./MasterPublishBar";
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

const MasterPanel = dynamic(() => import("./MasterPanel"), { ssr: false });
const StemLoopBrowser = dynamic(() => import("./StemLoopBrowser"), { ssr: false });
const SampleLibraryPanel = dynamic(() => import("./SampleLibraryPanel"), { ssr: false });
const ProducerKitUploader = dynamic(() => import("./ProducerKitUploader"), { ssr: false });
const OpenStudioSessionsPanel = dynamic(() => import("./OpenStudioSessionsPanel"), { ssr: false });
const MidiPanel = dynamic(() => import("./MidiPanel"), { ssr: false });

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

type RecordReviewState = {
  trackId: TrackId;
  durationSec: number;
  deleted: boolean;
};

type LoudnessTarget = -16 | -14 | -10;
type ExportLoudnessPreset = "streaming" | "club" | "broadcast";

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
  kind:
    | "save"
    | "load"
    | "stem-load"
    | "autosave"
    | "record"
    | "import"
    | "beat"
    | "export"
    | "publish"
    | "comment"
    | "payout";
  detail: string;
};

type StudioComment = {
  id: string;
  authorId: string | null;
  authorName: string;
  focusMode: FocusMode;
  message: string;
  createdAt: string;
  timelineSec: number | null;
};

type WalletRoleAggregate = {
  pendingCents: number;
  paidCents: number;
  clawbackCents: number;
  count: number;
};

type WalletPayload = {
  balance?: {
    pendingDollars?: number;
    paidDollars?: number;
    clawbackDollars?: number;
    pendingCents?: number;
    paidCents?: number;
    clawbackCents?: number;
  };
  roleAggregates?: Record<string, WalletRoleAggregate>;
  recentPayouts?: Array<{
    id: string;
    amount: number;
    status: string;
    createdAt: string;
    paidAt: string | null;
  }>;
};

type ConnectAccountPayload = {
  connected: boolean;
  accountId?: string;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
  onboardingComplete?: boolean;
};

type SongOption = {
  id: string;
  title: string;
  artist: string;
  revenueSharePct: number;
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

const STUDIO_COMMENTS_KEY = "ems-studio-comments-v1";
const STUDIO_COMPACT_STRIPS_KEY = "ems-studio-compact-strips-v1";
const STUDIO_RECORD_WIZARD_KEY = "ems-studio-record-wizard-v1";

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

function avgBand(spectrum: number[], start: number, end: number): number {
  const lo = Math.max(0, Math.min(spectrum.length - 1, start));
  const hi = Math.max(lo, Math.min(spectrum.length - 1, end));
  let total = 0;
  let count = 0;
  for (let i = lo; i <= hi; i++) {
    total += spectrum[i] ?? 0;
    count += 1;
  }
  return count > 0 ? total / count : 0;
}

/** "Surprise me" generator. Picks a random kit + a finished-sounding
 *  pattern + a random BPM in the trap/drill range. Goal: a visitor who
 *  doesn't know what they want hears a pro-quality beat in one click,
 *  and the bar for "I made this" drops from "create from nothing" to
 *  "tweak something already good." */
const SURPRISE_KITS: DrumKitId[] = ["trap", "drill", "boomBap", "lofi", "hyperpop"];
function surpriseSession(): { kit: DrumKitId; pattern: BeatPattern; bpm: number; label: string } {
  const kit = SURPRISE_KITS[Math.floor(Math.random() * SURPRISE_KITS.length)] ?? "trap";
  // Most kits read best with the trap-style pattern (kick on 1/the-and-of-2/3.5,
  // backbeat clap, fast hats). Lo-fi/boomBap use the four-on-the-floor demo.
  const pattern = (kit === "lofi" || kit === "boomBap") ? demoPattern() : trapDemoPattern();
  const bpmRange: Record<DrumKitId, [number, number]> = {
    trap: [88, 102],
    drill: [136, 148],
    boomBap: [82, 96],
    lofi: [70, 86],
    hyperpop: [148, 168],
    afro: [98, 110],
    acoustic: [88, 102],
  };
  const [lo, hi] = bpmRange[kit];
  const bpm = Math.round(lo + Math.random() * (hi - lo));
  const label = `${kit.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())} · ${bpm} BPM`;
  return { kit, pattern, bpm, label };
}

function safeLocalStorageGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures in restricted/private browser contexts.
  }
}

function isFocusMode(value: unknown): value is FocusMode {
  return value === "all" || value === "record" || value === "arrange" || value === "mix" || value === "publish";
}

function deriveKitTrackColor(name: string): string {
  const lower = name.toLowerCase();
  if (/kick|snare|hat|clap|drum|perc|rim|cymbal/.test(lower)) return "#22d3ee";
  if (/808|bass|sub/.test(lower)) return "#a78bfa";
  if (/vox|vocal|chant|adlib/.test(lower)) return "#ec4899";
  if (/fx|impact|riser|sweep|noise/.test(lower)) return "#10b981";
  return "#f59e0b";
}

function deriveKitTrackName(fileName: string, index: number): string {
  const base = fileName.replace(/\.[^.]+$/, "").trim();
  if (!base) return `Kit sample ${index + 1}`;
  return base.slice(0, 40);
}

function inferLaneFromFileName(fileName: string): DrumKind | null {
  const lower = fileName.toLowerCase();
  if (/\b(808|sub|bass)\b/.test(lower)) return "bass808";
  if (/\b(openhat|open[-_ ]hat|oh)\b/.test(lower)) return "openHat";
  if (/\b(hihat|hi[-_ ]hat|hat|chh)\b/.test(lower)) return "hat";
  if (/\b(snare|sd|rim)\b/.test(lower)) return "snare";
  if (/\b(clap|cp)\b/.test(lower)) return "clap";
  if (/\b(kick|bd)\b/.test(lower)) return "kick";
  if (/\b(crash|cym|ride)\b/.test(lower)) return "crash";
  if (/\b(perc|percussion|conga|shaker|tom)\b/.test(lower)) return "perc";
  return null;
}

function parseStudioCommentPayload(payload: unknown): StudioComment | null {
  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as Partial<StudioComment>;
  if (typeof candidate.id !== "string" || candidate.id.length === 0) return null;
  if (typeof candidate.authorName !== "string" || candidate.authorName.trim().length === 0) return null;
  if (!isFocusMode(candidate.focusMode)) return null;
  if (typeof candidate.message !== "string") return null;
  const message = candidate.message.trim();
  if (!message) return null;
  if (typeof candidate.createdAt !== "string" || Number.isNaN(Date.parse(candidate.createdAt))) return null;
  const timelineSec =
    typeof candidate.timelineSec === "number" && Number.isFinite(candidate.timelineSec)
      ? Math.max(0, candidate.timelineSec)
      : null;
  return {
    id: candidate.id,
    authorId: typeof candidate.authorId === "string" ? candidate.authorId : null,
    authorName: candidate.authorName.trim().slice(0, 64),
    focusMode: candidate.focusMode,
    message: message.slice(0, 320),
    createdAt: candidate.createdAt,
    timelineSec,
  };
}

export default function DawWorkspace({ isGuest = false }: { isGuest?: boolean } = {}) {
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
  const [manualBpmInput, setManualBpmInput] = useState("90");
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
  const [comments, setComments] = useState<StudioComment[]>([]);
  const [recordReview, setRecordReview] = useState<RecordReviewState | null>(null);
  const [compactStrips, setCompactStrips] = useState(false);
  const [showRecordWizard, setShowRecordWizard] = useState(true);
  const [heavyUiReady, setHeavyUiReady] = useState(false);
  const [loudnessTarget, setLoudnessTarget] = useState<LoudnessTarget>(-14);
  const [exportLoudnessPreset, setExportLoudnessPreset] = useState<ExportLoudnessPreset>("streaming");
  const sessionStartedAt = useRef<number>(Date.now());
  const wasRecordingRef = useRef(false);
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

  useEffect(() => {
    const timer = window.setTimeout(() => setHeavyUiReady(true), 260);
    return () => window.clearTimeout(timer);
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
  const appendComment = useCallback((comment: StudioComment) => {
    setComments((prev) => {
      if (prev.some((existing) => existing.id === comment.id)) return prev;
      return [comment, ...prev]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 80);
    });
  }, []);

  useEffect(() => {
    if (!heavyUiReady) return;
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
    channel.on("broadcast", { event: "studio_comment" }, ({ payload }) => {
      const parsed = parseStudioCommentPayload(payload);
      if (!parsed) return;
      appendComment(parsed);
    });
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
  }, [appendComment, clientPresenceId, heavyUiReady]);

  // When focusMode changes, re-track presence on the live channel
  // without recreating it.
  useEffect(() => {
    if (!heavyUiReady) return;
    const channel = presenceChannelRef.current;
    if (!channel) return;
    void channel.track({
      id: clientPresenceId,
      name: displayNameRef.current,
      focusMode,
      isPlaying: false,
      updatedAt: new Date().toISOString(),
    } satisfies CollaboratorPresence);
  }, [focusMode, clientPresenceId, heavyUiReady]);

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
    const dismissed = safeLocalStorageGet(key);
    setShowGuide(dismissed !== "1");
  }, []);

  useEffect(() => {
    const key = "ems-studio-session-notes-v1";
    const saved = safeLocalStorageGet(key);
    if (saved) setSessionNotes(saved);
  }, []);

  useEffect(() => {
    const raw = safeLocalStorageGet(STUDIO_COMMENTS_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as unknown[];
      if (!Array.isArray(parsed)) return;
      const next = parsed
        .map((item) => parseStudioCommentPayload(item))
        .filter((item): item is StudioComment => item !== null)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 80);
      setComments(next);
    } catch {
      // Ignore malformed local cache.
    }
  }, []);

  useEffect(() => {
    safeLocalStorageSet(STUDIO_COMMENTS_KEY, JSON.stringify(comments.slice(0, 80)));
  }, [comments]);

  useEffect(() => {
    const saved = safeLocalStorageGet(STUDIO_COMPACT_STRIPS_KEY);
    if (saved === "1") setCompactStrips(true);
  }, []);

  useEffect(() => {
    safeLocalStorageSet(STUDIO_COMPACT_STRIPS_KEY, compactStrips ? "1" : "0");
  }, [compactStrips]);

  useEffect(() => {
    const saved = safeLocalStorageGet(STUDIO_RECORD_WIZARD_KEY);
    if (saved === "dismissed") setShowRecordWizard(false);
  }, []);

  const ensureInit = useCallback((): boolean => {
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
  }, [snapshot]);

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
  }, [ensureInit, stemsSongId]);

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
  const reviewTrack = useMemo(
    () => (recordReview ? tracks.find((track) => track.id === recordReview.trackId) ?? null : null),
    [recordReview, tracks],
  );

  useEffect(() => {
    if (typeof transport?.bpm !== "number") return;
    setManualBpmInput(String(transport.bpm));
  }, [transport?.bpm]);

  useEffect(() => {
    if (transport?.isRecording) {
      wasRecordingRef.current = true;
      return;
    }
    if (!wasRecordingRef.current) return;
    wasRecordingRef.current = false;
    const trackId = transport?.lastRecordedTrackId;
    if (!trackId) return;
    const track = tracks.find((candidate) => candidate.id === trackId);
    if (!track) return;
    setRecordReview({
      trackId,
      durationSec: track.durationSec,
      deleted: !track.hasAudio,
    });
  }, [tracks, transport?.isRecording, transport?.lastRecordedTrackId]);

  const pushAuditEvent = useCallback((kind: StudioAuditEvent["kind"], detail: string) => {
    const entry: StudioAuditEvent = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      at: Date.now(),
      kind,
      detail,
    };
    setAuditEvents((prev) => [entry, ...prev].slice(0, 24));
  }, []);

  const applyFrontlineVocalBus = useCallback((trackId: TrackId) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setTrackEq(trackId, "low", -3);
    engine.setTrackEq(trackId, "mid", 2);
    engine.setTrackEq(trackId, "high", 3);
    engine.setTrackComp(trackId, { enabled: true, threshDb: -26, ratio: 5 });
    engine.setTrackVocalBus(trackId, {
      enabled: true,
      driveDb: 6,
      presenceDb: 3.5,
      airDb: 4,
      crush: 0.35,
    });
    engine.setTrackReverb(trackId, { wet: 0.12, decaySec: 1.2 });
    engine.setTrackDelay(trackId, { wet: 0.07, beats: 0.25, feedback: 0.18 });
  }, []);

  const findVocalTrack = useCallback(() => {
    const engine = engineRef.current;
    const liveTracks = engine?.getSnapshot().tracks ?? [];
    return liveTracks.find((track) => /vocal/i.test(track.name)) ?? liveTracks[0] ?? null;
  }, []);

  const applySoundPreset = useCallback((preset: "record" | "mix") => {
    const engine = engineRef.current;
    if (!engine) return;
    if (preset === "record") {
      const vocalTrack = findVocalTrack();
      if (vocalTrack) {
        applyFrontlineVocalBus(vocalTrack.id);
        setFocusedId(vocalTrack.id);
      }
      engine.setLatencyMode("recording");
      engine.setVocalCaptureProfile("punchy");
      engine.setMetronome(true);
      setNotice({ tone: "success", message: "Record preset loaded: frontline vocal bus, low latency, and metronome on." });
      return;
    }
    engine.setLatencyMode("mixing");
    engine.setVocalCaptureProfile("smooth");
    engine.setMetronome(false);
    setNotice({ tone: "success", message: "Mix preset loaded: stable playback + smooth vocal profile." });
  }, [applyFrontlineVocalBus, findVocalTrack]);

  const launchInstantRecordSetup = useCallback(() => {
    if (!ensureInit()) return;
    const engine = engineRef.current;
    if (!engine) return;

    const liveTracks = engine.getSnapshot().tracks;
    if (liveTracks.length === 0) return;
    const vocalTrack = liveTracks.find((track) => /vocal/i.test(track.name)) ?? liveTracks[0]!;

    for (const track of liveTracks) {
      engine.setTrackArmed(track.id, track.id === vocalTrack.id);
      if (track.id !== vocalTrack.id) engine.setTrackMonitor(track.id, false);
    }

    engine.setBpm(92);
    engine.setLatencyMode("recording");
    engine.setVocalCaptureProfile("punchy");
    applyFrontlineVocalBus(vocalTrack.id);
    engine.setMetronome(true);
    engine.setLoopEnabled(false);
    engine.setPunchIn(false, 0, 4);

    setFocusedId(vocalTrack.id);
    setFocusMode("record");
    setShowRecordWizard(true);
    safeLocalStorageSet(STUDIO_RECORD_WIZARD_KEY, "active");
    pushAuditEvent("record", "Instant record setup armed the vocal lane");
    setNotice({
      tone: "success",
      message: `Instant setup ready: ${vocalTrack.name} armed with frontline vocal bus, metronome on.`,
    });
  }, [applyFrontlineVocalBus, ensureInit, pushAuditEvent]);

  const nudgeMasterToTarget = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !transport) return;
    const lufsError = (transport.masterLufs ?? -60) - loudnessTarget;
    const dbNudge = Math.max(-3, Math.min(3, lufsError * 0.5));
    const nextDb = Math.max(-24, Math.min(6, transport.masterDb - dbNudge));
    engine.setMasterDb(nextDb);
    setNotice({
      tone: "info",
      message: `Master nudged to ${nextDb.toFixed(1)} dB toward ${loudnessTarget} LUFS target.`,
    });
  }, [loudnessTarget, transport]);

  const applyMonoSafeBalance = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const liveTracks = engine.getSnapshot().tracks;
    let adjusted = 0;
    for (const track of liveTracks) {
      const isLowEnd = /kick|808|bass|sub/i.test(track.name);
      if (!isLowEnd) continue;
      const needsPanCenter = Math.abs(track.pan) > 0.02;
      const nextReverb = Math.min(track.fx.reverbWet, 0.12);
      const nextDelay = Math.min(track.fx.delayWet, 0.08);
      if (needsPanCenter || nextReverb !== track.fx.reverbWet || nextDelay !== track.fx.delayWet) {
        engine.setTrackPan(track.id, 0);
        engine.setTrackReverb(track.id, { wet: nextReverb, decaySec: track.fx.reverbDecaySec });
        engine.setTrackDelay(track.id, {
          wet: nextDelay,
          beats: track.fx.delayBeats,
          feedback: track.fx.delayFeedback,
        });
        adjusted += 1;
      }
    }
    const aux = engine.getSnapshot().aux;
    if (aux.reverbReturn.level > 0.9) engine.setAuxReverbLevel(0.9);
    if (aux.delayReturn.level > 0.85) engine.setAuxDelayLevel(0.85);
    setNotice({
      tone: "success",
      message:
        adjusted > 0
          ? `Centered low-end on ${adjusted} track${adjusted === 1 ? "" : "s"} for mono compatibility.`
          : "Low-end already mono-safe.",
    });
  }, []);

  const tightenStereoFx = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const liveTracks = engine.getSnapshot().tracks;
    let adjusted = 0;
    for (const track of liveTracks) {
      const nextReverb = track.fx.reverbWet > 0.2 ? track.fx.reverbWet * 0.82 : track.fx.reverbWet;
      const nextDelay = track.fx.delayWet > 0.18 ? track.fx.delayWet * 0.8 : track.fx.delayWet;
      if (nextReverb !== track.fx.reverbWet || nextDelay !== track.fx.delayWet) {
        engine.setTrackReverb(track.id, { wet: nextReverb, decaySec: track.fx.reverbDecaySec });
        engine.setTrackDelay(track.id, {
          wet: nextDelay,
          beats: track.fx.delayBeats,
          feedback: track.fx.delayFeedback,
        });
        adjusted += 1;
      }
    }
    const aux = engine.getSnapshot().aux;
    engine.setAuxReverbLevel(Math.min(aux.reverbReturn.level, 0.95));
    engine.setAuxDelayLevel(Math.min(aux.delayReturn.level, 0.9));
    setNotice({
      tone: "success",
      message:
        adjusted > 0
          ? `Tightened stereo FX on ${adjusted} track${adjusted === 1 ? "" : "s"}.`
          : "Stereo FX are already tight.",
    });
  }, []);

  const toggleMonoPreview = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const snap = engine.getSnapshot();
    engine.setMonoPreview(!snap.transport.monoPreviewOn);
    setNotice({
      tone: "info",
      message: snap.transport.monoPreviewOn
        ? "Stereo preview restored."
        : "Mono preview enabled for translation checks.",
    });
  }, []);

  const submitComment = useCallback(
    async (rawMessage: string) => {
      const message = rawMessage.trim();
      if (!message) return;
      const comment: StudioComment = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        authorId: session?.user?.id ?? null,
        authorName: session?.user?.name?.trim() || "Studio creator",
        focusMode,
        message: message.slice(0, 320),
        createdAt: new Date().toISOString(),
        timelineSec: typeof transport?.positionSec === "number" ? transport.positionSec : null,
      };
      appendComment(comment);
      pushAuditEvent("comment", `Shared note in ${focusMode} mode`);
      const channel = presenceChannelRef.current;
      if (!channel) return;
      try {
        await channel.send({
          type: "broadcast",
          event: "studio_comment",
          payload: comment,
        });
      } catch {
        setNotice({
          tone: "warning",
          message: "Comment saved locally. Live sync looks offline right now.",
        });
      }
    },
    [
      appendComment,
      focusMode,
      pushAuditEvent,
      session?.user?.id,
      session?.user?.name,
      transport?.positionSec,
    ],
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

  const laneSampleSignature = useMemo(() => {
    if (!beat) return "";
    return JSON.stringify(beat.laneSampleNames);
  }, [beat]);

  useEffect(() => {
    if (!autosaveOn) return;
    if (!snapshot) return;
    const timer = window.setTimeout(() => {
      void createAutosaveVersion();
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [autosaveOn, beat?.kit, createAutosaveVersion, laneSampleSignature, snapshot, transport?.bpm]);

  // ── Tap tempo + keyboard shortcuts ──────────────────────────────────────
  function applyManualBpmInput(input: string) {
    if (!ensureInit()) return;
    const parsed = Number(input);
    if (!Number.isFinite(parsed)) {
      setManualBpmInput(String(transport?.bpm ?? 90));
      return;
    }
    const clamped = Math.max(40, Math.min(240, Math.round(parsed)));
    engineRef.current?.setBpm(clamped);
    setManualBpmInput(String(clamped));
  }

  function nudgeBpm(delta: number) {
    const current = transport?.bpm ?? 90;
    applyManualBpmInput(String(current + delta));
  }

  function handleTapTempo() {
    if (!ensureInit()) return;
    const bpm = engineRef.current?.tapTempo();
    if (bpm) {
      setManualBpmInput(String(bpm));
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

  const assignBeatLaneSample = useCallback(
    async (lane: DrumKind, file: File) => {
      if (!ensureInit()) return;
      const ok = await engineRef.current?.setBeatLaneSample(lane, file);
      if (ok) {
        pushAuditEvent("beat", `Assigned ${file.name} to ${lane}`);
        setNotice({
          tone: "success",
          message: `${lane.toUpperCase()} now uses ${file.name} (auto-trimmed, leveled, and lane-EQ shaped).`,
        });
        return;
      }
      setNotice({ tone: "error", message: `Couldn't decode ${file.name}. Try WAV, MP3, or FLAC.` });
    },
    [ensureInit, pushAuditEvent],
  );

  const clearBeatLaneSample = useCallback(
    (lane: DrumKind) => {
      engineRef.current?.clearBeatLaneSample(lane);
      pushAuditEvent("beat", `Cleared custom sample on ${lane}`);
      setNotice({ tone: "info", message: `${lane.toUpperCase()} reverted to kit sound.` });
    },
    [pushAuditEvent],
  );

  const importSoundKitFiles = useCallback(
    async (files: File[]) => {
      if (!ensureInit()) return;
      const engine = engineRef.current;
      if (!engine) return;

      const allowedByExt = /\.(wav|mp3|m4a|aif|aiff|flac|ogg)$/i;
      const audioFiles = files.filter((file) => file.type.startsWith("audio/") || allowedByExt.test(file.name));
      if (audioFiles.length === 0) {
        setNotice({ tone: "warning", message: "No audio files found. Upload WAV, MP3, FLAC, AIFF, or M4A samples." });
        return;
      }

      const limited = audioFiles.slice(0, 24);
      const usedFiles = new Set<File>();
      let laneAssigned = 0;

      for (const file of limited) {
        const lane = inferLaneFromFileName(file.name);
        if (!lane) continue;
        if (usedFiles.has(file)) continue;
        const ok = await engine.setBeatLaneSample(lane, file);
        if (!ok) continue;
        usedFiles.add(file);
        laneAssigned += 1;
      }

      const trackFiles = limited.filter((file) => !usedFiles.has(file));
      let imported = 0;
      let firstTrackId: TrackId | null = null;

      for (let i = 0; i < trackFiles.length; i++) {
        const file = trackFiles[i];
        const trackName = deriveKitTrackName(file.name, i);
        const trackId = engine.addTrack(trackName, deriveKitTrackColor(trackName));
        if (!firstTrackId) firstTrackId = trackId;
        try {
          await engine.importAudioFile(trackId, file);
          imported += 1;
        } catch (err) {
          console.warn("[DawWorkspace] kit import failed", { file: file.name, err });
        }
      }

      if (!imported && laneAssigned === 0) {
        setNotice({ tone: "error", message: "Couldn't import this kit. Try smaller files or another format." });
        return;
      }

      if (firstTrackId) setFocusedId(firstTrackId);
      setSnapshot(engine.getSnapshot());
      setStats((s) => ({ ...s, imports: s.imports + imported + laneAssigned }));
      pushAuditEvent(
        "import",
        `Imported ${imported} tracks and mapped ${laneAssigned} lane sample${laneAssigned === 1 ? "" : "s"}`,
      );
      setNotice({
        tone: "success",
        message:
          imported + laneAssigned === limited.length
            ? `Imported ${imported} track sample${imported === 1 ? "" : "s"} and auto-mapped ${laneAssigned} lane one-shot${laneAssigned === 1 ? "" : "s"}.`
            : `Imported ${imported + laneAssigned}/${limited.length} kit files. Some files couldn't be decoded.`,
      });
    },
    [ensureInit, pushAuditEvent],
  );

  const applyBeatLaneSteps = useCallback(
    (lane: DrumKind, nextSteps: boolean[]) => {
      if (!beat) return;
      const engine = engineRef.current;
      if (!engine) return;
      const nextPattern = emptyBeatPattern();
      for (const laneId of DRUM_LANES) {
        nextPattern[laneId] = laneId === lane ? [...nextSteps] : [...beat.pattern[laneId]];
      }
      engine.setBeatPattern(nextPattern);
    },
    [beat],
  );

  async function toggleRecording() {
    if (!ensureInit()) return;
    const engine = engineRef.current!;
    if (transport?.isRecording) {
      await engine.stopRecording();
      setStats((s) => ({ ...s, takes: s.takes + 1 }));
      pushAuditEvent("record", "Captured new recording take");
      setNotice({ tone: "success", message: "Take captured — playing back now. Use ▶ or 🗑 on the track to review or delete." });
      engine.seek(0);
      void engine.play();
      return;
    }
    const currentTracks = snapshot?.tracks ?? [];
    if (currentTracks.length > 0 && !currentTracks.some((track) => track.armed)) {
      setNotice({ tone: "warning", message: "Arm at least one track before recording." });
      return;
    }
    if (transport?.punchInEnabled) {
      const punchInSec = transport.punchInSec;
      const punchOutSec = transport.punchOutSec;
      const leadInSec = Math.max(0, punchInSec - 1);
      if ((transport.positionSec ?? 0) >= punchOutSec || !transport.isPlaying) engine.seek(leadInSec);
      if (!transport.isPlaying) void engine.play();
      setNotice({
        tone: "info",
        message: `Punch-in armed from ${punchInSec.toFixed(1)}s to ${punchOutSec.toFixed(1)}s. Playback will record only in that window.`,
      });
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
      onSetVocalBus: (params) => engine.setTrackVocalBus(id, params),
      onSetReverb: (params) => engine.setTrackReverb(id, params),
      onSetDelay: (params) => engine.setTrackDelay(id, params),
    });
    setNotice({ tone: "success", message: `Rack preset applied to ${focusedTrack.name}.` });
  }

  // ── AI Master: bounce mix → upload → matchering → load mastered ────────
  // Loaded back as a "Master (AI)" track so the artist can A/B against
  // their unmastered version and decide whether to ship it.
  const [masteringInFlight, setMasteringInFlight] = useState(false);
  async function aiMasterMix(wav: Blob): Promise<{ ok: boolean; message?: string }> {
    if (masteringInFlight) return { ok: false, message: "Already mastering." };
    setMasteringInFlight(true);
    try {
      // Step 1: upload the bounce so Replicate can fetch it.
      const fileName = `ems-master-source-${Date.now()}.wav`;
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
      };
      if (!signRes.ok || !signJson.signedUrl || !signJson.publicUrl) {
        return { ok: false, message: "Upload signing failed." };
      }
      const put = await fetch(signJson.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": "audio/wav" },
        body: wav,
      });
      if (!put.ok) return { ok: false, message: `Storage upload failed (${put.status}).` };

      // Step 2: kick off the mastering job.
      setNotice({
        tone: "info",
        message: "AI mastering started — this takes ~60s. Keep the tab open.",
      });
      const renderRes = await fetch("/api/mastering/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioUrl: signJson.publicUrl }),
      });
      const renderData = (await renderRes.json().catch(() => ({}))) as {
        status?: string;
        masteredUrl?: string;
        providerId?: string;
        error?: string;
      };
      if (!renderRes.ok && renderRes.status !== 202) {
        return { ok: false, message: renderData.error ?? "Mastering failed." };
      }

      // If still processing, poll the status endpoint.
      let masteredUrl = renderData.masteredUrl;
      if (!masteredUrl && renderData.providerId) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < 4 * 60_000) {
          await new Promise((r) => setTimeout(r, 6000));
          const statusRes = await fetch(
            `/api/mastering/status?id=${encodeURIComponent(renderData.providerId)}`,
          );
          const statusData = (await statusRes.json().catch(() => ({}))) as {
            status?: string;
            masteredUrl?: string | null;
            error?: string | null;
          };
          if (statusData.status === "succeeded" && statusData.masteredUrl) {
            masteredUrl = statusData.masteredUrl;
            break;
          }
          if (statusData.status === "failed" || statusData.status === "canceled") {
            return { ok: false, message: statusData.error ?? "Mastering failed." };
          }
        }
      }
      if (!masteredUrl) {
        return { ok: false, message: "Mastering timed out. Try again." };
      }

      // Step 3: load the mastered audio back as a new track.
      const engine = engineRef.current;
      if (!engine) return { ok: false, message: "Audio engine unavailable." };
      const mBlob = await (await fetch(masteredUrl)).blob();
      const masterTrackId = engine.addTrack("Master (AI)", "#fbbf24");
      await engine.importAudioFile(masterTrackId, mBlob);
      setFocusedId(masterTrackId);
      setSnapshot(engine.getSnapshot());
      pushAuditEvent("import", "AI mastering complete — loaded as Master (AI) track.");
      return { ok: true, message: "AI master loaded as a new track. A/B with your raw mix." };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "Mastering failed.",
      };
    } finally {
      setMasteringInFlight(false);
    }
  }

  // ── Publish: render mix → WAV → /api/upload signed URL → PUT bytes ──────
  async function publishMix(wav: Blob): Promise<{ ok: boolean; message?: string }> {
    // Guest path: stash the WAV in IndexedDB and bounce through signup.
    // /studio/new picks the stash up after auth and finishes the upload
    // against the now-authenticated session, so the visitor never has
    // to re-render their mix.
    if (isGuest) {
      try {
        const fileName = `ems-studio-${Date.now()}.wav`;
        const { stashGuestMix, GUEST_RESUME_FLAG } = await import("@/lib/guestStash");
        await stashGuestMix(wav, fileName);
        try { window.localStorage.setItem(GUEST_RESUME_FLAG, "1"); } catch { /* private mode */ }
        setStats((s) => ({ ...s, publishes: s.publishes + 1 }));
        pushAuditEvent("publish", "Stashed mix as guest — bouncing to single-field email capture");
        // Funnel event: WAV stashed, about to redirect to email capture.
        try {
          const { postFunnelEvent } = await import("@/lib/funnelClient");
          const { FUNNEL_EVENTS } = await import("@/lib/funnelEvents");
          void postFunnelEvent({
            event: FUNNEL_EVENTS.guestPublishStash,
            source: "studio_try_daw",
            properties: { sizeBytes: wav.size },
          });
        } catch { /* non-blocking */ }
        // Send them to the single-field magic-link page rather than the
        // full /auth/signup gauntlet. /studio/try/save asks for one email,
        // sends a passwordless link, and the visitor lands back at
        // /studio/new?from=guest-resume authed and ready to publish.
        router.push("/studio/try/save");
        return { ok: true, message: "Saved your mix — drop your email to keep it." };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error
            ? `Couldn't save your mix locally: ${err.message}. Try signing up first.`
            : "Couldn't save your mix locally. Try signing up first.",
        };
      }
    }

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
    <div className="relative mx-auto max-w-6xl px-4 pt-6 pb-[calc(env(safe-area-inset-bottom)+5rem)] sm:py-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -top-28 left-8 h-64 w-64 rounded-full bg-cyan-500/12 blur-3xl" />
        <div className="absolute top-24 -right-16 h-72 w-72 rounded-full bg-fuchsia-500/10 blur-3xl" />
        <div className="absolute bottom-20 left-1/4 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      {showGuide && (
        <QuickStartGuide
          onInstantSetup={launchInstantRecordSetup}
          onClose={() => {
            setShowGuide(false);
            safeLocalStorageSet("ems-studio-guide-dismissed-v1", "1");
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
            Frontline vocal bus, adaptive latency, MIDI capture, beat patterns, master render, and
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
              const vocalTrack = findVocalTrack();
              engineRef.current?.setBpm(92);
              engineRef.current?.setLatencyMode("recording");
              engineRef.current?.setVocalCaptureProfile("punchy");
              if (vocalTrack) {
                applyFrontlineVocalBus(vocalTrack.id);
                engineRef.current?.setTrackArmed(vocalTrack.id, true);
                setFocusedId(vocalTrack.id);
              }
              setFocusMode("record");
              pushAuditEvent("record", "Loaded Vocal template (92 BPM + frontline bus)");
              setNotice({ tone: "success", message: "Vocal template loaded with the frontline bus." });
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
          onInstantSetup={launchInstantRecordSetup}
          onForum={() => router.push("/forum")}
        />
      )}

      {initError && (
        <div className="mb-4 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {initError}
        </div>
      )}

      {notice && <StudioNotice notice={notice} onDismiss={() => setNotice(null)} />}

      {recordReview && !transport?.isRecording && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-50 shadow-[0_0_0_1px_rgba(34,211,238,0.06)]">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-100/75">Latest take</p>
            <p className="truncate font-semibold text-white">
              {reviewTrack?.name ?? "Recorded track"} · {recordReview.durationSec.toFixed(1)}s
            </p>
            <p className="text-xs text-cyan-50/75">
              {recordReview.deleted
                ? "Take removed. Undo it here if you want the audio back."
                : "Quick review before you keep the take or delete it."}
            </p>
          </div>

          {!recordReview.deleted && reviewTrack?.hasAudio && (
            <button
              type="button"
              onClick={() => engineRef.current?.previewTake(recordReview.trackId)}
              className="rounded-full border border-cyan-200/25 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-cyan-50 transition hover:bg-cyan-200/10"
            >
              Hear take
            </button>
          )}

          {!recordReview.deleted && reviewTrack?.hasAudio && (
            <button
              type="button"
              onClick={() => {
                const ok = engineRef.current?.deleteTrackAudio(recordReview.trackId);
                if (!ok) return;
                setRecordReview((current) =>
                  current && current.trackId === recordReview.trackId
                    ? { ...current, deleted: true }
                    : current,
                );
                setNotice({ tone: "success", message: "Take deleted. Hit Undo if you want it back." });
              }}
              className="rounded-full border border-red-400/30 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-red-100 transition hover:bg-red-400/10"
            >
              Delete take
            </button>
          )}

          {recordReview.deleted && (
            <button
              type="button"
              onClick={() => {
                const ok = engineRef.current?.undoDeleteTrackAudio(recordReview.trackId);
                if (!ok) return;
                setRecordReview((current) =>
                  current && current.trackId === recordReview.trackId
                    ? { ...current, deleted: false }
                    : current,
                );
                setNotice({ tone: "success", message: "Take restored." });
              }}
              className="rounded-full border border-emerald-300/30 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-emerald-100 transition hover:bg-emerald-300/10"
            >
              Undo delete
            </button>
          )}

          <button
            type="button"
            onClick={() => setRecordReview(null)}
            className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white/80 transition hover:bg-white/10"
          >
            Keep
          </button>
        </div>
      )}

      {/* ── Transport — sticky Pro Tools-style master bar ───────────────────
          The transport pins to the top of the viewport so REW/PLAY/REC and
          the time display stay in reach no matter how far the user scrolls
          through tracks, FX, or the master section. The big REC pill on
          the left makes it impossible to mistake whether the engine is
          recording. */}
      <div className="sticky top-[64px] z-30 mb-6 -mx-4 px-4 sm:mx-0 sm:px-0">
      <div
        className={`flex flex-wrap items-center gap-3 rounded-2xl border p-4 shadow-2xl shadow-black/40 backdrop-blur-md transition ${
          transport?.isRecording
            ? "border-red-500/45 bg-[linear-gradient(135deg,rgba(40,8,8,0.92),rgba(12,8,12,0.92))]"
            : "border-white/10 bg-[linear-gradient(135deg,rgba(12,12,20,0.92),rgba(10,10,18,0.92))]"
        }`}
      >
        <div className="mb-1 flex w-full items-center justify-between text-[10px] font-black uppercase tracking-[0.24em] text-white/45">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className={`inline-block h-2 w-2 rounded-full ${
                transport?.isRecording
                  ? "led-on-rec animate-pulse"
                  : transport?.isPlaying
                    ? "led-on-green"
                    : "led-on-amber"
              }`}
            />
            <span>Control Room</span>
          </div>
          <span
            className={
              transport?.isRecording
                ? "rounded-full border border-red-400/60 bg-red-500/20 px-2 py-0.5 text-[10px] font-black tracking-[0.32em] text-red-100"
                : "text-cyan-100/65"
            }
          >
            {transport?.isRecording ? "● REC LIVE" : transport?.isPlaying ? "PLAYBACK" : "STANDBY"}
          </span>
        </div>

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
          data-tour="play-button"
        >
          {transport?.isPlaying ? "■" : "▶"}
        </button>

        <button
          type="button"
          onClick={() => {
            if (!ensureInit()) return;
            const engine = engineRef.current!;
            const { kit, pattern, bpm, label } = surpriseSession();
            engine.setBeatKit(kit);
            engine.setBeatPattern(pattern);
            engine.setBpm(bpm);
            engine.setBeatEnabled(true);
            setNotice({ tone: "info", message: `✨ Loaded ${label} — press play.` });
            pushAuditEvent("beat", `Surprise Me · ${label}`);
            // Auto-play if they're not already going. Honors reduced-motion
            // by skipping the auto-start so screen-reader users aren't
            // surprised by sudden audio.
            const prefersMotion = typeof window !== "undefined"
              && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            if (prefersMotion && !transport?.isPlaying) {
              void engine.play();
            }
          }}
          className="flex h-11 items-center gap-1.5 rounded-full border border-amber-400/40 bg-gradient-to-r from-amber-400/15 via-fuchsia-500/15 to-cyan-400/10 px-3 text-xs font-extrabold uppercase tracking-widest text-amber-200 transition hover:from-amber-400/25 hover:via-fuchsia-500/25"
          title="Load a randomized finished session"
        >
          ✨ Surprise me
        </button>

        <button
          type="button"
          onClick={() => {
            if (!ensureInit()) return;
            void toggleRecording();
          }}
          className={`flex h-11 items-center gap-2 rounded-full px-5 text-sm font-black uppercase tracking-widest transition ${
            transport?.isRecording
              ? "bg-red-600 text-white shadow-[0_0_18px_rgba(239,68,68,0.7)] hover:bg-red-700"
              : "border border-red-500/55 bg-red-500/10 text-red-200 hover:bg-red-500/20"
          }`}
          aria-label={transport?.isRecording ? "Stop recording" : "Record"}
        >
          <span
            aria-hidden
            className={`h-3 w-3 rounded-full bg-current ${
              transport?.isRecording ? "animate-pulse" : ""
            }`}
          />
          {transport?.isRecording ? "● Recording" : "Record"}
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

        <div className="rounded-xl border border-white/12 bg-black/30 px-2 py-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white/70">BPM</span>
            <button
              type="button"
              onClick={() => nudgeBpm(-1)}
              className="rounded-md border border-white/15 px-2 py-1 text-xs font-bold text-white/80 hover:bg-white/10"
              title="Decrease BPM by 1"
            >
              −
            </button>
            <input
              type="number"
              min={40}
              max={240}
              value={manualBpmInput}
              onChange={(e) => setManualBpmInput(e.target.value)}
              onBlur={(e) => applyManualBpmInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyManualBpmInput((e.target as HTMLInputElement).value);
              }}
              className="w-16 rounded-md border border-white/15 bg-black/40 px-2 py-1 text-center text-sm font-mono"
              aria-label="Manual BPM"
              title="Type BPM and press Enter"
            />
            <button
              type="button"
              onClick={() => nudgeBpm(1)}
              className="rounded-md border border-white/15 px-2 py-1 text-xs font-bold text-white/80 hover:bg-white/10"
              title="Increase BPM by 1"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => applyManualBpmInput(String(Math.max(40, Math.round((transport?.bpm ?? 90) / 2))))}
              className="rounded-md border border-white/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white/70 hover:bg-white/10"
              title="Half-time"
            >
              1/2
            </button>
            <button
              type="button"
              onClick={() => applyManualBpmInput(String(Math.min(240, Math.round((transport?.bpm ?? 90) * 2))))}
              className="rounded-md border border-white/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white/70 hover:bg-white/10"
              title="Double-time"
            >
              ×2
            </button>
          </div>
          <input
            type="range"
            min={40}
            max={240}
            step={1}
            value={transport?.bpm ?? 90}
            onChange={(e) => applyManualBpmInput(e.target.value)}
            className="mt-2 w-full accent-accent-400"
            aria-label="BPM slider"
          />
        </div>

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

        <button
          type="button"
          onClick={() => {
            if (!ensureInit()) return;
            engineRef.current?.setPunchIn(
              !(transport?.punchInEnabled ?? false),
              transport?.punchInSec ?? 0,
              transport?.punchOutSec ?? 4,
            );
          }}
          className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
            transport?.punchInEnabled
              ? "bg-cyan-300 text-black"
              : "border border-white/15 text-white/70 hover:bg-white/10"
          }`}
          title="When enabled, Record starts playback and only captures inside the punch window."
        >
          Punch-in
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

        {transport?.punchInEnabled && (
          <span className="flex items-center gap-1 rounded-md border border-cyan-400/30 bg-cyan-500/5 px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-cyan-100">
            <input
              type="number"
              min={0}
              step={0.25}
              value={transport.punchInSec.toFixed(2)}
              onChange={(e) => {
                if (!ensureInit()) return;
                engineRef.current?.setPunchIn(true, Number(e.target.value), transport.punchOutSec);
              }}
              className="w-12 bg-transparent text-right outline-none"
              aria-label="Punch-in start (seconds)"
            />
            →
            <input
              type="number"
              min={0.5}
              step={0.25}
              value={transport.punchOutSec.toFixed(2)}
              onChange={(e) => {
                if (!ensureInit()) return;
                engineRef.current?.setPunchIn(true, transport.punchInSec, Number(e.target.value));
              }}
              className="w-12 bg-transparent text-right outline-none"
              aria-label="Punch-in end (seconds)"
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

        <label className="flex items-center gap-2 text-xs font-semibold text-white/70">
          Vocal
          <select
            value={transport?.vocalCaptureProfile ?? "hybrid"}
            onChange={(e) => {
              if (!ensureInit()) return;
              engineRef.current?.setVocalCaptureProfile(
                e.target.value as TransportState["vocalCaptureProfile"],
              );
            }}
            className="rounded-md border border-white/15 bg-black/40 px-2 py-1 text-sm font-semibold"
            title="Raw = minimal, Punchy = forward, Smooth = leveled, Hybrid = combines all."
          >
            <option value="raw">Raw</option>
            <option value="punchy">Punchy</option>
            <option value="smooth">Smooth</option>
            <option value="hybrid">All (Hybrid)</option>
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
      </div>

      <p className="-mt-3 mb-6 text-center text-[10px] uppercase tracking-[0.28em] text-white/30">
        Space play · R record · L loop · M metronome · T tap · Home rewind · A-W-S-E-D... play synth · Drop audio on a track to import
      </p>

      {!showSplash && (
        <div className="mb-5 grid gap-2 sm:grid-cols-5">
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

          <button
            type="button"
            onClick={() => setCompactStrips((value) => !value)}
            className="rounded-xl border border-white/12 bg-white/[0.03] px-3 py-2 text-left transition hover:bg-white/[0.07]"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">Channel strips</p>
            <p className="mt-1 text-sm font-semibold text-white">{compactStrips ? "Compact mode" : "Expanded mode"}</p>
          </button>
        </div>
      )}

      {/* ── Track strips ─────────────────────────────────────────────────────
          Pushed up to immediately follow the transport so the recording
          surface is the FIRST thing the artist sees and clicks. The Sound
          Coach / Record Readiness Wizard / Loudness Assistant — which are
          all advisory helpers, not primary controls — render below the
          tracks so they don't push the actual workspace off-screen. */}
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
                onSetVocalBus={(params) => engineRef.current?.setTrackVocalBus(track.id, params)}
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
                onPreviewTake={track.hasAudio ? () => engineRef.current?.previewTake(track.id) : null}
                onDeleteTake={track.hasAudio ? () => {
                  const ok = engineRef.current?.deleteTrackAudio(track.id);
                  if (ok) {
                    setRecordReview({ trackId: track.id, durationSec: track.durationSec, deleted: true });
                    setNotice({ tone: "success", message: `Take deleted. Hit ↩ Undo in the banner to restore.` });
                  }
                } : null}
                onSeek={(sec) => engineRef.current?.seek(sec)}
                onInputGain={(db) => engineRef.current?.setTrackInputGain(track.id, db)}
                isRecording={transport?.isRecording ?? false}
                compact={compactStrips}
              />
            ))}
          </div>
        )}
      </div>}

      {/* ── After-track helpers ─────────────────────────────────────────
          Sound Coach, Record Readiness Wizard, and Loudness Assistant
          render below the tracks. They suggest sound presets, walk you
          through a healthy record session, and meter master loudness —
          all secondary to the actual track surface above. */}
      {!showSplash && (
        <StudioSoundCoach
          transport={transport ?? null}
          onPreset={applySoundPreset}
          onFrontlineBus={() => {
            const vocalTrack = findVocalTrack();
            if (!vocalTrack) return;
            applyFrontlineVocalBus(vocalTrack.id);
            setFocusedId(vocalTrack.id);
            setNotice({ tone: "success", message: `Frontline bus loaded on ${vocalTrack.name}.` });
          }}
        />
      )}

      {!showSplash && showRecordWizard && (
        <RecordReadinessWizard
          browserHealth={browserHealth}
          transport={transport ?? null}
          armedTracks={tracks.filter((track) => track.armed).length}
          onLoadRecordPreset={() => applySoundPreset("record")}
          onStartRecord={() => {
            void toggleRecording();
          }}
          onDismiss={() => {
            setShowRecordWizard(false);
            safeLocalStorageSet(STUDIO_RECORD_WIZARD_KEY, "dismissed");
          }}
        />
      )}

      {!showSplash && (
        <MasterLoudnessAssistant
          masterLufs={transport?.masterLufs ?? -60}
          masterTruePeak={transport?.masterTruePeak ?? 0}
          target={loudnessTarget}
          onChangeTarget={(target) => setLoudnessTarget(target)}
          onNudge={nudgeMasterToTarget}
        />
      )}

      {!showSplash && transport && (
        <MixIntelligencePanel
          spectrum={transport.masterSpectrum}
          masterLufs={transport.masterLufs}
          masterTruePeak={transport.masterTruePeak}
          phaseCorrelation={transport.masterPhaseCorrelation}
          monoPreviewOn={transport.monoPreviewOn}
          beat={beat ?? null}
          tracks={tracks}
          aux={snapshot?.aux ?? null}
          onCenterLowEnd={applyMonoSafeBalance}
          onTightenStereoFx={tightenStereoFx}
          onToggleMonoPreview={toggleMonoPreview}
        />
      )}

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
            laneSampleNames={beat.laneSampleNames}
            laneFrequencyProfiles={beat.laneFrequencyProfiles}
            onToggleStep={(lane, step) => {
              const cur = beat.pattern[lane][step];
              engineRef.current?.setBeatStep(lane, step, !cur);
            }}
            onToggleEnabled={() => engineRef.current?.setBeatEnabled(!beat.enabled)}
            onClear={() => engineRef.current?.setBeatPattern(emptyBeatPattern())}
            onRenderToTrack={renderBeatToTrack}
            onSelectBank={(bank) => engineRef.current?.setActivePatternBank(bank)}
            onSelectKit={(kit) => engineRef.current?.setBeatKit(kit)}
            onAssignLaneSample={assignBeatLaneSample}
            onClearLaneSample={clearBeatLaneSample}
            onFillLane={(lane, on) => {
              applyBeatLaneSteps(lane, Array(STEPS).fill(on));
            }}
            onRandomizeLane={(lane, density) => {
              applyBeatLaneSteps(
                lane,
                Array.from({ length: STEPS }, (_, index) => {
                  if (index % 4 === 0) return Math.random() < Math.max(density, 0.55);
                  return Math.random() < density;
                }),
              );
            }}
            onShiftLane={(lane, direction) => {
              const current = beat.pattern[lane];
              const offset = direction === "left" ? -1 : 1;
              const shifted = Array.from({ length: STEPS }, (_, index) => {
                const source = (index - offset + STEPS) % STEPS;
                return Boolean(current[source]);
              });
              applyBeatLaneSteps(lane, shifted);
            }}
            rendering={renderingBeat}
          />
        </div>
      )}

      {/* ── Sample Library + Stem Loop Browser side-by-side on desktop ─── */}
      {!showSplash && (showArrangeTools || showRecordTools) && (
        <div className="mb-6 grid gap-3 lg:grid-cols-2">
          {heavyUiReady ? (
            <>
              <SampleLibraryPanel
                onLoadSample={async ({ name, url, category }) => {
                  const engine = engineRef.current;
                  if (!engine) return;
                  try {
                    const blob = await (await fetch(url)).blob();
                    const palette: Record<string, string> = {
                      drums: "#22d3ee",
                      bass: "#a78bfa",
                      melody: "#f59e0b",
                      fx: "#10b981",
                      vocals: "#ec4899",
                    };
                    const trackId = engine.addTrack(name, palette[category] ?? "#7c5cff");
                    await engine.importAudioFile(trackId, blob);
                    setFocusedId(trackId);
                    setSnapshot(engine.getSnapshot());
                    pushAuditEvent("import", `Loaded sample: ${name}`);
                    setNotice({ tone: "success", message: `Loaded ${name}.` });
                  } catch (err) {
                    console.warn("[DawWorkspace] sample load failed", err);
                    setNotice({ tone: "error", message: "Couldn't load sample." });
                  }
                }}
              />
              <StemLoopBrowser
                onLoadStem={async ({ sourceTitle, kind, url }) => {
                  const engine = engineRef.current;
                  if (!engine) return;
                  try {
                    const blob = await (await fetch(url)).blob();
                    const trackName = `${sourceTitle.slice(0, 14)} · ${kind}`;
                    const colors: Record<string, string> = {
                      vocals: "#ec4899",
                      drums: "#22d3ee",
                      bass: "#a78bfa",
                      other: "#f59e0b",
                    };
                    const trackId = engine.addTrack(trackName, colors[kind] ?? "#7c5cff");
                    await engine.importAudioFile(trackId, blob);
                    setFocusedId(trackId);
                    setSnapshot(engine.getSnapshot());
                    pushAuditEvent(
                      "import",
                      `Loaded ${kind} stem from "${sourceTitle}" — 2% royalty share will accrue to source artist on derived revenue.`,
                    );
                    setNotice({
                      tone: "success",
                      message: `Loaded ${kind}. 2% of your future revenue from this track will route to the source artist.`,
                    });
                  } catch (err) {
                    console.warn("[DawWorkspace] stem load failed", err);
                    setNotice({ tone: "error", message: "Couldn't load stem. Try another." });
                  }
                }}
              />
            </>
          ) : (
            <>
              <DeferredPanelPlaceholder label="Sample library" />
              <DeferredPanelPlaceholder label="Stem loop browser" />
            </>
          )}
        </div>
      )}

      {!showSplash && (showArrangeTools || showRecordTools) && (
        <div className="mb-6">
          <ProducerKitUploader onImportFiles={importSoundKitFiles} />
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
      {!showSplash && snapshot && showArrangeTools && heavyUiReady && (
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
      {!showSplash && transport && showPublishTools && heavyUiReady && (
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
            const targetLufs: Record<ExportLoudnessPreset, number> = {
              streaming: -14,
              broadcast: -16,
              club: -9,
            };
            const originalDb = transport.masterDb;
            const currentLufs = Number.isFinite(transport.masterLufs)
              ? transport.masterLufs
              : targetLufs[exportLoudnessPreset];
            const correction = Math.max(-6, Math.min(6, targetLufs[exportLoudnessPreset] - currentLufs));
            engine.setMasterDb(Math.max(-24, Math.min(6, originalDb + correction)));
            let wav: Blob;
            try {
              wav = await engine.exportWav();
            } finally {
              engine.setMasterDb(originalDb);
            }
            setStats((s) => ({ ...s, exports: s.exports + 1 }));
            pushAuditEvent("export", `Exported WAV mixdown (${exportLoudnessPreset})`);
            return wav;
          }}
          loudnessPreset={exportLoudnessPreset}
          onSetLoudnessPreset={setExportLoudnessPreset}
          onPublish={publishMix}
          onAiMaster={aiMasterMix}
        />
      )}

      {!showSplash && showPublishTools && heavyUiReady && (
        <CollaborationPresencePanel
          collaborators={collaborators}
          connected={presenceConnected}
          autosaveOn={autosaveOn}
          onToggleAutosave={() => setAutosaveOn((v) => !v)}
          lastAutosaveAt={lastAutosaveAt}
          versions={versions}
          onRestoreVersion={handleLoad}
          onRecoverLatest={() => {
            const latest = versions[0];
            if (!latest) return Promise.resolve();
            return handleLoad(latest.id);
          }}
          onPublishForum={postPreviewToForum}
          postingForum={postingForum}
          canPost={canExport}
          auditEvents={auditEvents}
          comments={comments}
          onSubmitComment={submitComment}
        />
      )}

      {!showSplash && showPublishTools && heavyUiReady && (
        <StudioMonetizationPanel
          onAudit={pushAuditEvent}
          onNotice={setNotice}
        />
      )}

      {!showSplash && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <SessionNotesPanel
            value={sessionNotes}
            onChange={(next) => {
              setSessionNotes(next);
              safeLocalStorageSet("ems-studio-session-notes-v1", next);
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
        Studio board now includes live presence, collab comments, autosave versioning, forum preview publishing, and payouts control.
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

      {/* Open Studio Sessions — fixed-position panel that broadcasts the
          artist's working session to fans via Supabase Realtime broadcast.
          Only renders for authenticated users; visitor count comes from
          the existing collaborator-presence channel. */}
      {session?.user?.id && heavyUiReady && (
        <OpenStudioSessionsPanel
          artistId={session.user.id}
          artistName={session.user.name?.trim() || "Studio creator"}
          artistAvatar={session.user.image ?? null}
          visitorCount={collaborators.filter((c) => c.id !== clientPresenceId).length}
        />
      )}

      {!showSplash && (
        <MobileRecordDock
          positionSec={transport?.positionSec ?? 0}
          isPlaying={Boolean(transport?.isPlaying)}
          isRecording={Boolean(transport?.isRecording)}
          metronomeOn={Boolean(transport?.metronomeOn)}
          onTogglePlay={() => {
            if (!ensureInit()) return;
            const engine = engineRef.current;
            if (!engine) return;
            if (transport?.isPlaying) engine.stop();
            else void engine.play();
          }}
          onToggleRecord={() => {
            if (!ensureInit()) return;
            void toggleRecording();
          }}
          onRewind={() => {
            if (!ensureInit()) return;
            engineRef.current?.rewind();
          }}
          onToggleMetronome={() => {
            if (!ensureInit()) return;
            engineRef.current?.setMetronome(!(transport?.metronomeOn ?? false));
          }}
        />
      )}
    </div>
  );
}

function BlueprintStatusPanel({ ready }: { ready: boolean }) {
  const items = [
    ["Frontline bus", "Drive, air, and parallel crush keep lead vocals up front."],
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
  onInstantSetup,
  onForum,
}: {
  onTemplate: (preset: "vocal" | "club" | "master") => void;
  onInstantSetup: () => void;
  onForum: () => void;
}) {
  return (
    <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[10px] font-black uppercase tracking-[0.2em] text-white/55">Fast launch</span>
        <button type="button" onClick={onInstantSetup} className="rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-black uppercase tracking-widest text-black hover:bg-emerald-300">Instant record</button>
        <button type="button" onClick={() => onTemplate("vocal")} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10">Vocal template</button>
        <button type="button" onClick={() => onTemplate("club")} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10">Club template</button>
        <button type="button" onClick={() => onTemplate("master")} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10">Master template</button>
        <button type="button" onClick={onForum} className="ml-auto rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-white hover:bg-brand-600">Open forum timeline</button>
      </div>
    </section>
  );
}

function StudioSoundCoach({
  transport,
  onPreset,
  onFrontlineBus,
}: {
  transport: TransportState | null;
  onPreset: (preset: "record" | "mix") => void;
  onFrontlineBus: () => void;
}) {
  const qualityTips = [
    "Record in Record latency mode, then switch to Mix when editing.",
    "Keep metronome on for clean timing, then disable during final print.",
    "Use Punch-in for fixing one line instead of redoing full takes.",
  ];

  return (
    <section className="mb-6 rounded-2xl border border-white/12 bg-[linear-gradient(145deg,rgba(5,8,14,0.82),rgba(9,16,24,0.74))] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-100/75">Sound Coach</p>
          <p className="mt-1 text-sm font-semibold text-white">One-click setup for cleaner recordings and easier sessions</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onPreset("record")}
            className="rounded-lg border border-cyan-300/30 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-cyan-100 transition hover:bg-cyan-300/10"
          >
            Record preset
          </button>
          <button
            type="button"
            onClick={onFrontlineBus}
            className="rounded-lg border border-amber-300/35 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-amber-100 transition hover:bg-amber-300/10"
          >
            Frontline bus
          </button>
          <button
            type="button"
            onClick={() => onPreset("mix")}
            className="rounded-lg border border-emerald-300/30 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-emerald-100 transition hover:bg-emerald-300/10"
          >
            Mix preset
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {qualityTips.map((tip) => (
          <p key={tip} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/75">
            {tip}
          </p>
        ))}
      </div>

      <p className="mt-3 text-[11px] text-white/55">
        Current profile: {transport?.vocalCaptureProfile ?? "-"} · latency: {transport?.latencyMode ?? "-"} · punch-in {transport?.punchInEnabled ? "on" : "off"}
      </p>
    </section>
  );
}

function RecordReadinessWizard({
  browserHealth,
  transport,
  armedTracks,
  onLoadRecordPreset,
  onStartRecord,
  onDismiss,
}: {
  browserHealth: BrowserHealth | null;
  transport: TransportState | null;
  armedTracks: number;
  onLoadRecordPreset: () => void;
  onStartRecord: () => void;
  onDismiss: () => void;
}) {
  type ReadinessStatus = "ok" | "warn" | "pending";

  const noiseLevel = transport?.masterLevel ?? 0;
  const micReady = Boolean(browserHealth?.mediaDevices && browserHealth?.mediaRecorder && browserHealth?.secureContext);
  const isLiveCalibrating = Boolean(transport?.isRecording);
  const noiseOk = noiseLevel < 0.03;
  const levelOk = noiseLevel >= 0.08 && noiseLevel <= 0.75;

  const checks = [
    {
      label: "Mic + browser",
      status: (micReady ? "ok" : "warn") as ReadinessStatus,
      detail: micReady ? "Ready" : "Need mic permission + secure context",
    },
    {
      label: "Track armed",
      status: (armedTracks > 0 ? "ok" : "warn") as ReadinessStatus,
      detail: armedTracks > 0 ? `${armedTracks} armed` : "Arm a track",
    },
    {
      label: "Noise floor",
      status: (!isLiveCalibrating ? "pending" : noiseOk ? "ok" : "warn") as ReadinessStatus,
      detail: !isLiveCalibrating
        ? "Checked live while recording"
        : noiseOk
          ? "Quiet enough"
          : "Room noise is elevated",
    },
    {
      label: "Input level",
      status: (!isLiveCalibrating ? "pending" : levelOk ? "ok" : "warn") as ReadinessStatus,
      detail: !isLiveCalibrating
        ? "Start recording to calibrate"
        : levelOk
          ? "Healthy level"
          : "Speak/sing and watch meter",
    },
  ];
  const completed = checks.filter((item) => item.status === "ok").length;

  return (
    <section className="mb-6 rounded-2xl border border-white/12 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-100/75">Recording wizard</p>
          <p className="mt-1 text-sm font-semibold text-white">Quick check before rolling a take</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md border border-white/15 px-2.5 py-1 text-[11px] font-semibold text-white/70 hover:bg-white/10"
        >
          Hide
        </button>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-4">
        {checks.map((item) => (
          <div
            key={item.label}
            className={`rounded-lg border px-3 py-2 ${
              item.status === "ok"
                ? "border-emerald-400/30 bg-emerald-500/10"
                : item.status === "pending"
                  ? "border-cyan-300/20 bg-cyan-500/10"
                  : "border-white/10 bg-black/25"
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">{item.label}</p>
            <p className="mt-1 text-xs font-semibold text-white/85">{item.detail}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onLoadRecordPreset}
          className="rounded-lg border border-cyan-300/35 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-cyan-100 hover:bg-cyan-300/10"
        >
          Load record preset
        </button>
        <button
          type="button"
          onClick={onStartRecord}
          disabled={armedTracks === 0}
          className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-red-600 disabled:opacity-50"
        >
          Start recording
        </button>
        <p className="text-xs text-white/55">Checklist: {completed}/4 complete</p>
      </div>
    </section>
  );
}

function MasterLoudnessAssistant({
  masterLufs,
  masterTruePeak,
  target,
  onChangeTarget,
  onNudge,
}: {
  masterLufs: number;
  masterTruePeak: number;
  target: LoudnessTarget;
  onChangeTarget: (target: LoudnessTarget) => void;
  onNudge: () => void;
}) {
  const delta = masterLufs - target;
  const peakDbtp = masterTruePeak > 0 ? 20 * Math.log10(masterTruePeak) : -60;

  return (
    <section className="mb-6 rounded-2xl border border-white/12 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-100/75">Master loudness</p>
          <p className="mt-1 text-sm font-semibold text-white">Tune your print toward a loudness target</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {([-16, -14, -10] as LoudnessTarget[]).map((candidate) => (
            <button
              key={candidate}
              type="button"
              onClick={() => onChangeTarget(candidate)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${
                candidate === target
                  ? "bg-emerald-400 text-black"
                  : "border border-white/15 text-white/70 hover:bg-white/10"
              }`}
            >
              {candidate} LUFS
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/45">Current LUFS</p>
          <p className="mt-1 font-mono text-sm text-white/85">{masterLufs.toFixed(1)}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/45">Delta</p>
          <p className="mt-1 font-mono text-sm text-white/85">{delta >= 0 ? "+" : ""}{delta.toFixed(1)} LU</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/45">True peak</p>
          <p className="mt-1 font-mono text-sm text-white/85">{peakDbtp.toFixed(1)} dBTP</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onNudge}
          className="rounded-lg border border-emerald-300/35 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-emerald-100 hover:bg-emerald-300/10"
        >
          Nudge master toward target
        </button>
        <p className="text-xs text-white/55">Streaming target is usually near -14 LUFS with true peak below -1 dBTP.</p>
      </div>
    </section>
  );
}

function MixIntelligencePanel({
  spectrum,
  masterLufs,
  masterTruePeak,
  phaseCorrelation,
  monoPreviewOn,
  beat,
  tracks,
  aux,
  onCenterLowEnd,
  onTightenStereoFx,
  onToggleMonoPreview,
}: {
  spectrum: number[];
  masterLufs: number;
  masterTruePeak: number;
  phaseCorrelation: number;
  monoPreviewOn: boolean;
  beat: BeatMachineState | null;
  tracks: TrackState[];
  aux: AuxBusState | null;
  onCenterLowEnd: () => void;
  onTightenStereoFx: () => void;
  onToggleMonoPreview: () => void;
}) {
  const sub = avgBand(spectrum, 0, 2);
  const lowMid = avgBand(spectrum, 3, 8);
  const highMid = avgBand(spectrum, 14, 20);
  const air = avgBand(spectrum, 25, 31);
  const peakDbtp = masterTruePeak > 0 ? 20 * Math.log10(masterTruePeak) : -60;
  const lowEndTracks = tracks.filter((track) => /kick|808|bass|sub/i.test(track.name));
  const lowEndWideCount = lowEndTracks.filter(
    (track) => Math.abs(track.pan) > 0.12 || track.fx.reverbWet > 0.14 || track.fx.delayWet > 0.1,
  ).length;
  const stereoFxHeavyCount = tracks.filter(
    (track) => track.fx.reverbWet > 0.28 || track.fx.delayWet > 0.22,
  ).length;
  const laneProfiles = beat ? DRUM_LANES.map((lane) => ({ lane, profile: beat.laneFrequencyProfiles[lane] })) : [];
  const lowHeavyLaneProfiles = laneProfiles.filter(
    ({ profile }) => profile.lowBandRatio >= 0.35 && profile.dominantHz <= 220,
  );
  const kickProfile = beat?.laneFrequencyProfiles.kick ?? null;
  const bassProfile = beat?.laneFrequencyProfiles.bass808 ?? null;
  const kickBassGapHz = kickProfile && bassProfile ? Math.abs(kickProfile.dominantHz - bassProfile.dominantHz) : null;
  const overlapLaneLabels = lowHeavyLaneProfiles
    .slice(0, 3)
    .map(({ lane }) => lane.toUpperCase())
    .join(", ");
  const monoRisk =
    (lowEndWideCount > 0 ? 1 : 0) +
    (stereoFxHeavyCount > 2 ? 1 : 0) +
    (aux && (aux.reverbReturn.level > 1 || aux.delayReturn.level > 0.95) ? 1 : 0);

  const checks: Array<{ label: string; detail: string; tone: "ok" | "warn" | "neutral" }> = [
    {
      label: "Sub control",
      detail:
        sub > 0.74
          ? "Sub energy is very heavy. Trim kick/808 lows or shorten 808 tails."
          : sub < 0.16
            ? "Sub is thin. Add weight around 45-70 Hz in kick/808 lane."
            : "Sub balance is healthy.",
      tone: sub > 0.74 || sub < 0.16 ? "warn" : "ok",
    },
    {
      label: "Mud zone (120-350)",
      detail:
        lowMid > 0.66
          ? "Low-mids are crowded. Pull 200-300 Hz on non-bass sources."
          : "Low-mid buildup is under control.",
      tone: lowMid > 0.66 ? "warn" : "ok",
    },
    {
      label: "Harsh zone (2.5k-6k)",
      detail:
        highMid > 0.72
          ? "Harshness risk. Ease hats/claps presence or tame with gentle dynamic EQ."
          : "Upper mids are balanced.",
      tone: highMid > 0.72 ? "warn" : "ok",
    },
    {
      label: "Air and sparkle",
      detail:
        air < 0.14
          ? "Top-end is dark. Lift air on hats/open hats or add subtle high shelf."
          : "Air band has enough extension.",
      tone: air < 0.14 ? "neutral" : "ok",
    },
    {
      label: "Loudness window",
      detail:
        masterLufs > -9
          ? "Very loud print. Great for clubs, but may be hot for streaming."
          : masterLufs < -18
            ? "Quiet print. Raise level or use nudge toward target."
            : "Loudness is in a practical release range.",
      tone: masterLufs > -9 || masterLufs < -18 ? "warn" : "ok",
    },
    {
      label: "True peak safety",
      detail:
        peakDbtp > -1
          ? "Oversampled true peak above -1 dBTP. Back off limiter/master by 1-2 dB."
          : peakDbtp > -2
            ? "Oversampled true peak is close to ceiling. Leave a little more headroom for codec safety."
            : "Oversampled true peak safety margin looks good.",
      tone: peakDbtp > -1 ? "warn" : peakDbtp > -2 ? "neutral" : "ok",
    },
    {
      label: "Low-end lane occupancy",
      detail:
        lowHeavyLaneProfiles.length > 2
          ? `Low-end overlap across ${overlapLaneLabels}. Carve with lane HP/LP and retune kick/808.`
          : kickBassGapHz !== null && kickBassGapHz < 14
            ? "Kick and 808 centers are very close. Separate by tuning one lane 15-25 Hz away."
            : "Lane low-end occupancy is reasonably separated.",
      tone:
        lowHeavyLaneProfiles.length > 2 || (kickBassGapHz !== null && kickBassGapHz < 14)
          ? "warn"
          : "ok",
    },
    {
      label: "Mono compatibility",
      detail:
        monoRisk >= 2
          ? "Mono fold-down risk is elevated. Center low-end and tighten stereo FX."
          : monoRisk === 1
            ? "Some mono risk detected. Check low-end panning and wide time FX."
            : "Mono compatibility looks healthy.",
      tone: monoRisk >= 2 ? "warn" : monoRisk === 1 ? "neutral" : "ok",
    },
    {
      label: "Phase correlation",
      detail:
        phaseCorrelation < 0
          ? "Out-of-phase risk detected. Collapse suspect FX or center layered low-end."
          : phaseCorrelation < 0.25
            ? "Wide but fragile stereo image. Check mono preview before print."
            : "Phase relationship is stable.",
      tone: phaseCorrelation < 0 ? "warn" : phaseCorrelation < 0.25 ? "neutral" : "ok",
    },
  ];

  return (
    <section className="mb-6 rounded-2xl border border-white/12 bg-white/[0.03] p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-100/75">Mix intelligence</p>
          <p className="mt-1 text-sm font-semibold text-white">Realtime spectrum guardrails while you produce</p>
        </div>
        <span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-cyan-100">
          Live advisor
        </span>
      </header>

      <div className="grid gap-2 md:grid-cols-3">
        {checks.map((check) => (
          <div
            key={check.label}
            className={`rounded-lg border px-3 py-2 ${
              check.tone === "warn"
                ? "border-amber-400/30 bg-amber-500/10"
                : check.tone === "ok"
                  ? "border-emerald-400/25 bg-emerald-500/10"
                  : "border-white/10 bg-black/25"
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/55">{check.label}</p>
            <p className="mt-1 text-xs text-white/80">{check.detail}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onCenterLowEnd}
          className="rounded-lg border border-cyan-300/35 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-cyan-100 hover:bg-cyan-300/10"
        >
          Center low-end
        </button>
        <button
          type="button"
          onClick={onTightenStereoFx}
          className="rounded-lg border border-violet-300/35 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-violet-100 hover:bg-violet-300/10"
        >
          Tighten stereo FX
        </button>
        <button
          type="button"
          onClick={onToggleMonoPreview}
          className={`rounded-lg border px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${
            monoPreviewOn
              ? "border-amber-300/40 bg-amber-500/15 text-amber-100"
              : "border-white/20 text-white/80 hover:bg-white/10"
          }`}
        >
          {monoPreviewOn ? "Mono preview on" : "Mono preview"}
        </button>
        <p className="text-xs text-white/55">
          Mono checks: {lowEndWideCount} low-end lane{lowEndWideCount === 1 ? "" : "s"} wide · {stereoFxHeavyCount} stereo-heavy FX lane{stereoFxHeavyCount === 1 ? "" : "s"} · phase {phaseCorrelation.toFixed(2)}.
        </p>
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

function DeferredPanelPlaceholder({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/45">Loading</p>
      <p className="mt-1 text-sm font-semibold text-white/85">{label}</p>
      <p className="mt-2 text-xs text-white/50">Preparing this panel in the background for faster first paint.</p>
    </div>
  );
}

function MobileRecordDock({
  positionSec,
  isPlaying,
  isRecording,
  metronomeOn,
  onTogglePlay,
  onToggleRecord,
  onRewind,
  onToggleMetronome,
}: {
  positionSec: number;
  isPlaying: boolean;
  isRecording: boolean;
  metronomeOn: boolean;
  onTogglePlay: () => void;
  onToggleRecord: () => void;
  onRewind: () => void;
  onToggleMetronome: () => void;
}) {
  return (
    <div className="fixed right-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] left-3 z-[70] rounded-2xl border border-white/15 bg-[#060913]/95 p-2.5 shadow-2xl shadow-black/45 backdrop-blur sm:hidden">
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-100/70">Mobile control room</p>
        <p className="font-mono text-sm font-bold text-white">{fmtTime(positionSec)}</p>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <button
          type="button"
          onClick={onTogglePlay}
          className={`rounded-xl px-3 py-3 text-sm font-black ${isPlaying ? "bg-white text-black" : "bg-brand-500 text-white"}`}
        >
          {isPlaying ? "Stop" : "Play"}
        </button>
        <button
          type="button"
          onClick={onToggleRecord}
          className={`rounded-xl px-3 py-3 text-sm font-black ${isRecording ? "bg-red-500 text-white" : "border border-red-400/40 text-red-200"}`}
        >
          {isRecording ? "Stop Rec" : "Record"}
        </button>
        <button
          type="button"
          onClick={onRewind}
          className="rounded-xl border border-white/15 px-3 py-3 text-sm font-black text-white/85"
        >
          Rewind
        </button>
        <button
          type="button"
          onClick={onToggleMetronome}
          className={`rounded-xl px-3 py-3 text-sm font-black ${metronomeOn ? "bg-accent-500 text-black" : "border border-white/15 text-white/80"}`}
        >
          Click
        </button>
      </div>
    </div>
  );
}

function QuickStartGuide({
  onClose,
  onInstantSetup,
}: {
  onClose: () => void;
  onInstantSetup: () => void;
}) {
  return (
    <section className="mb-5 rounded-2xl border border-cyan-300/25 bg-cyan-400/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-100/85">First session guide</p>
          <h2 className="mt-1 text-base font-extrabold text-white">Fastest path to a publish-ready session</h2>
          <p className="mt-1 text-sm text-white/70">1) Press play to initialize. 2) Record a take or render beat. 3) Export or publish.</p>
          <button
            type="button"
            onClick={onInstantSetup}
            className="mt-3 rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-black uppercase tracking-widest text-black hover:bg-emerald-300"
          >
            One-click instant record setup
          </button>
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
  onRecoverLatest,
  onPublishForum,
  postingForum,
  canPost,
  auditEvents,
  comments,
  onSubmitComment,
}: {
  collaborators: CollaboratorPresence[];
  connected: boolean;
  autosaveOn: boolean;
  onToggleAutosave: () => void;
  lastAutosaveAt: number | null;
  versions: VersionEntry[];
  onRestoreVersion: (id: string) => Promise<void>;
  onRecoverLatest: () => Promise<void>;
  onPublishForum: () => Promise<void>;
  postingForum: boolean;
  canPost: boolean;
  auditEvents: StudioAuditEvent[];
  comments: StudioComment[];
  onSubmitComment: (message: string) => Promise<void>;
}) {
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSending, setCommentSending] = useState(false);

  const sendComment = useCallback(async () => {
    const message = commentDraft.trim();
    if (!message || commentSending) return;
    setCommentSending(true);
    try {
      await onSubmitComment(message);
      setCommentDraft("");
    } finally {
      setCommentSending(false);
    }
  }, [commentDraft, commentSending, onSubmitComment]);

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-5">
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
          <button
            type="button"
            onClick={() => void onRecoverLatest()}
            disabled={versions.length === 0}
            className="mt-2 w-full rounded-lg border border-cyan-400/35 bg-cyan-500/10 px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Recover latest autosave
          </button>
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
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-200/85">Live comments</p>
          <p className="mt-2 text-xs text-white/55">Share handoff notes with timeline context while you mix.</p>
          <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto">
            {comments.slice(0, 8).map((comment) => (
              <li key={comment.id} className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-1 text-[11px] text-white/80">
                <p className="font-semibold text-white/85">
                  {comment.authorName} · {comment.focusMode}
                  {comment.timelineSec !== null ? ` · ${fmtTime(comment.timelineSec)}` : ""}
                </p>
                <p className="mt-0.5 break-words text-white/70">{comment.message}</p>
              </li>
            ))}
            {comments.length === 0 && <li className="text-xs text-white/45">No notes yet. Drop the first comment.</li>}
          </ul>
          <textarea
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            placeholder="Drop a mix note, arrangement callout, or publish handoff..."
            className="mt-2 min-h-16 w-full resize-y rounded-lg border border-white/12 bg-black/35 px-2 py-1.5 text-xs text-white placeholder:text-white/35 focus:border-brand-500/50 focus:outline-none"
            maxLength={320}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <a href="/forum" className="text-[11px] font-semibold text-cyan-200/85 hover:text-cyan-100">
              Open timeline
            </a>
            <button
              type="button"
              onClick={() => void sendComment()}
              disabled={!commentDraft.trim() || commentSending}
              className="rounded-md bg-cyan-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-black hover:bg-cyan-400 disabled:opacity-45"
            >
              {commentSending ? "Sending..." : "Send"}
            </button>
          </div>
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

function StudioMonetizationPanel({
  onAudit,
  onNotice,
}: {
  onAudit: (kind: StudioAuditEvent["kind"], detail: string) => void;
  onNotice: (notice: Notice | null) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [working, setWorking] = useState<"connect" | "onboarding" | "payout" | null>(null);
  const [connect, setConnect] = useState<ConnectAccountPayload>({ connected: false });
  const [wallet, setWallet] = useState<WalletPayload | null>(null);
  const [songs, setSongs] = useState<SongOption[]>([]);
  const [selectedSongId, setSelectedSongId] = useState("");
  const [splitRows, setSplitRows] = useState<
    Array<{ key: "producer" | "engineer" | "writer" | "label"; label: string; pct: number }>
  >([
    { key: "producer", label: "Producer", pct: 20 },
    { key: "engineer", label: "Engineer", pct: 10 },
    { key: "writer", label: "Writer", pct: 15 },
    { key: "label", label: "Label", pct: 10 },
  ]);

  const totalSplitPct = useMemo(
    () => splitRows.reduce((sum, row) => sum + row.pct, 0),
    [splitRows],
  );
  const artistSharePct = Math.max(0, 100 - totalSplitPct);
  const splitOverflowPct = Math.max(0, totalSplitPct - 100);
  const selectedSong = useMemo(
    () => songs.find((song) => song.id === selectedSongId) ?? null,
    [songs, selectedSongId],
  );

  const loadMonetization = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const [connectRes, walletRes, songsRes] = await Promise.all([
          fetch("/api/stripe-connect/account", { cache: "no-store" }),
          fetch("/api/wallet", { cache: "no-store" }),
          fetch("/api/songs/list?mine=1&sort=newest&limit=50", { cache: "no-store" }),
        ]);

        const connectJson = (await connectRes.json().catch(() => ({}))) as Partial<ConnectAccountPayload>;
        const nextConnect: ConnectAccountPayload =
          typeof connectJson.connected === "boolean"
            ? {
                connected: connectJson.connected,
                accountId: connectJson.accountId,
                chargesEnabled: Boolean(connectJson.chargesEnabled),
                payoutsEnabled: Boolean(connectJson.payoutsEnabled),
                detailsSubmitted: Boolean(connectJson.detailsSubmitted),
                onboardingComplete: Boolean(connectJson.onboardingComplete),
              }
            : { connected: false };
        setConnect(nextConnect);

        if (walletRes.ok) {
          const walletJson = (await walletRes.json().catch(() => ({}))) as WalletPayload;
          setWallet(walletJson);
        } else {
          setWallet(null);
        }

        const songsJson = (await songsRes.json().catch(() => [])) as unknown;
        const nextSongs = Array.isArray(songsJson)
          ? songsJson
              .map((item) => {
                if (!item || typeof item !== "object") return null;
                const candidate = item as Partial<SongOption>;
                if (
                  typeof candidate.id !== "string" ||
                  typeof candidate.title !== "string" ||
                  typeof candidate.artist !== "string"
                ) {
                  return null;
                }
                return {
                  id: candidate.id,
                  title: candidate.title,
                  artist: candidate.artist,
                  revenueSharePct:
                    typeof candidate.revenueSharePct === "number" ? candidate.revenueSharePct : 0,
                } satisfies SongOption;
              })
              .filter((item): item is SongOption => item !== null)
          : [];
        setSongs(nextSongs);
        setSelectedSongId((prev) =>
          prev && nextSongs.some((song) => song.id === prev) ? prev : (nextSongs[0]?.id ?? ""),
        );
      } catch {
        setConnect({ connected: false });
        setWallet(null);
        setSongs([]);
        setSelectedSongId("");
        onNotice({
          tone: "warning",
          message: "Could not refresh payout status right now. Retry in a few seconds.",
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [onNotice],
  );

  useEffect(() => {
    void loadMonetization();
  }, [loadMonetization]);

  async function createConnectAccount() {
    if (working) return;
    setWorking("connect");
    try {
      const res = await fetch("/api/stripe-connect/account", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not create Stripe Connect account.");
      onAudit("payout", "Created Stripe Connect account");
      onNotice({ tone: "success", message: "Stripe Connect account created." });
      await loadMonetization(true);
    } catch (err) {
      onNotice({
        tone: "error",
        message: err instanceof Error ? err.message : "Could not create Stripe Connect account.",
      });
    } finally {
      setWorking(null);
    }
  }

  async function launchOnboarding() {
    if (working) return;
    setWorking("onboarding");
    try {
      const res = await fetch("/api/stripe-connect/onboarding", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Onboarding link not available.");
      onAudit("payout", "Opened Stripe Connect onboarding");
      window.location.href = data.url;
    } catch (err) {
      onNotice({
        tone: "error",
        message: err instanceof Error ? err.message : "Could not start Stripe onboarding.",
      });
    } finally {
      setWorking(null);
    }
  }

  async function requestPayout() {
    if (working) return;
    if (!selectedSongId) {
      onNotice({ tone: "warning", message: "Select one of your songs before requesting a payout." });
      return;
    }
    setWorking("payout");
    try {
      const res = await fetch("/api/stripe-connect/payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId: selectedSongId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        amountCents?: number;
        payoutCount?: number;
      };
      if (!res.ok) throw new Error(data.error ?? "Payout request failed.");
      const amount = typeof data.amountCents === "number" ? data.amountCents / 100 : 0;
      onAudit("payout", `Requested payout for ${selectedSong?.title ?? "selected song"}`);
      onNotice({
        tone: "success",
        message: `Payout queued: $${amount.toFixed(2)} across ${data.payoutCount ?? 0} payout rows.`,
      });
      await loadMonetization(true);
    } catch (err) {
      onNotice({
        tone: "error",
        message: err instanceof Error ? err.message : "Payout request failed.",
      });
    } finally {
      setWorking(null);
    }
  }

  async function copySplitPlan() {
    const lines = [
      "Studio split draft",
      ...splitRows.map((row) => `${row.label}: ${row.pct}%`),
      `Artist remainder: ${artistSharePct}%`,
      selectedSong ? `Song: ${selectedSong.title}` : null,
    ].filter((line): line is string => line !== null);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      onNotice({ tone: "success", message: "Split draft copied to clipboard." });
      onAudit("payout", "Copied split draft");
    } catch {
      onNotice({ tone: "warning", message: "Clipboard write failed. You can still use the split preview." });
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-200/85">Revenue ops</p>
          <p className="text-xs text-white/55">Split planning plus direct payout actions from Studio.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadMonetization(true)}
          disabled={refreshing}
          className="rounded-md border border-white/15 px-2.5 py-1 text-[11px] font-semibold text-white/75 hover:bg-white/10 disabled:opacity-50"
        >
          {refreshing ? "Refreshing..." : "Refresh balances"}
        </button>
      </div>

      {loading ? (
        <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-white/55">
          Loading payout and wallet status...
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-200/85">Split planner</p>
            <div className="mt-2 space-y-2">
              {splitRows.map((row) => (
                <label key={row.key} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-white/75">{row.label}</span>
                  <span className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={row.pct}
                      onChange={(e) => {
                        const next = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                        setSplitRows((prev) =>
                          prev.map((item) => (item.key === row.key ? { ...item, pct: next } : item)),
                        );
                      }}
                      className="w-14 rounded border border-white/15 bg-black/35 px-1.5 py-1 text-right font-mono text-xs text-white"
                    />
                    <span className="text-white/50">%</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-white/70">Artist remainder: {artistSharePct}%</p>
            <p className={`text-xs ${splitOverflowPct > 0 ? "text-red-300" : "text-white/45"}`}>
              {splitOverflowPct > 0
                ? `Over-allocated by ${splitOverflowPct}%. Bring total down to 100%.`
                : `Collaborator total: ${totalSplitPct}%`}
            </p>
            <button
              type="button"
              onClick={() => void copySplitPlan()}
              className="mt-2 rounded-md border border-cyan-300/35 px-2.5 py-1 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-300/10"
            >
              Copy split draft
            </button>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-200/85">Connect + payout</p>
            <p className="mt-2 text-xs text-white/70">
              Account: {connect.connected ? "connected" : "not connected"} · Payouts: {connect.payoutsEnabled ? "enabled" : "pending"}
            </p>
            <p className="text-xs text-white/45">
              Onboarding: {connect.onboardingComplete ? "complete" : "incomplete"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {!connect.connected && (
                <button
                  type="button"
                  onClick={() => void createConnectAccount()}
                  disabled={working !== null}
                  className="rounded-md bg-brand-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
                >
                  {working === "connect" ? "Creating..." : "Create account"}
                </button>
              )}
              <button
                type="button"
                onClick={() => void launchOnboarding()}
                disabled={working !== null}
                className="rounded-md border border-white/15 px-2.5 py-1 text-[11px] font-semibold text-white/75 hover:bg-white/10 disabled:opacity-50"
              >
                {working === "onboarding" ? "Opening..." : "Open onboarding"}
              </button>
            </div>
            <label className="mt-3 block text-[11px] text-white/60">
              Song for payout
              <select
                value={selectedSongId}
                onChange={(e) => setSelectedSongId(e.target.value)}
                className="mt-1 w-full rounded-md border border-white/15 bg-black/35 px-2 py-1.5 text-xs text-white"
              >
                {songs.length === 0 ? (
                  <option value="">No songs found</option>
                ) : (
                  songs.map((song) => (
                    <option key={song.id} value={song.id}>
                      {song.title} · {song.artist}
                    </option>
                  ))
                )}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void requestPayout()}
              disabled={working !== null || !selectedSongId}
              className="mt-3 w-full rounded-md bg-emerald-400 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-black hover:bg-emerald-300 disabled:opacity-50"
            >
              {working === "payout" ? "Requesting..." : "Request payout"}
            </button>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-200/85">Wallet snapshot</p>
            <p className="mt-2 text-xs text-white/70">
              Pending: ${Number(wallet?.balance?.pendingDollars ?? 0).toFixed(2)}
            </p>
            <p className="text-xs text-white/70">Paid: ${Number(wallet?.balance?.paidDollars ?? 0).toFixed(2)}</p>
            <p className="text-xs text-white/45">
              Clawback: ${Number(wallet?.balance?.clawbackDollars ?? 0).toFixed(2)}
            </p>
            <div className="mt-2 max-h-24 space-y-1 overflow-y-auto">
              {(wallet?.recentPayouts ?? []).slice(0, 5).map((payout) => (
                <div key={payout.id} className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-1 text-[11px] text-white/75">
                  ${Number(payout.amount).toFixed(2)} · {payout.status.toLowerCase()} · {new Date(payout.createdAt).toLocaleDateString()}
                </div>
              ))}
              {(wallet?.recentPayouts?.length ?? 0) === 0 && (
                <p className="text-xs text-white/45">No payout rows yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
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
  onSetVocalBus,
  onSetReverb,
  onSetDelay,
  onSetSidechain,
  onImportFile,
  onDeleteTake,
  onPreviewTake,
  onSeek,
  onInputGain,
  isRecording,
  compact,
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
  onSetVocalBus: (params: {
    enabled?: boolean;
    driveDb?: number;
    presenceDb?: number;
    airDb?: number;
    crush?: number;
  }) => void;
  onSetReverb: (params: { wet?: number; decaySec?: number }) => void;
  onSetDelay: (params: { wet?: number; beats?: number; feedback?: number }) => void;
  onSetSidechain: (sourceId: TrackId | null, amount?: number) => void;
  onImportFile: (file: Blob) => void;
  onDeleteTake: (() => void) | null;
  onPreviewTake: (() => void) | null;
  /** Click/drag the waveform to scrub. Receives target position in
   *  seconds. */
  onSeek: (positionSec: number) => void;
  /** Per-track input trim, in dB. Range -24..+12. */
  onInputGain: (db: number) => void;
  /** True when the transport is currently recording. Combined with
   *  track.armed to draw the red ring on the track being captured. */
  isRecording: boolean;
  compact: boolean;
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
      className={`relative rounded-xl border transition ${compact ? "p-2.5" : "p-3"} ${
        isRecording && track.armed
          ? "border-red-500/70 bg-red-500/[0.06] shadow-[0_0_0_1px_rgba(239,68,68,0.45),0_0_24px_rgba(239,68,68,0.25)]"
          : dragging
            ? "border-brand-400 bg-brand-500/10"
            : focused
              ? "border-white/25 bg-gradient-to-r from-white/[0.07] to-cyan-400/[0.04]"
              : "border-white/10 bg-gradient-to-r from-white/[0.04] to-transparent"
      }`}
    >
      {isRecording && track.armed && (
        <span className="pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-white shadow-[0_0_12px_rgba(239,68,68,0.7)]">
          <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          Rec
        </span>
      )}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-brand-500/10 text-xs font-bold uppercase tracking-widest text-brand-200">
          Drop audio file to import
        </div>
      )}
      <div className={`grid gap-3 ${compact ? "lg:grid-cols-[minmax(160px,220px)_1fr]" : "lg:grid-cols-[minmax(160px,220px)_auto_minmax(260px,1fr)]"} lg:items-center`}>
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

          <Meter level={track.level} className={`h-2 ${compact ? "w-16" : "w-24"}`} />
        </div>

        {track.hasAudio && (
          <div className="flex items-center gap-1.5 ml-auto">
            {onPreviewTake && (
              <button
                type="button"
                onClick={onPreviewTake}
                title="Preview take"
                className="min-h-9 min-w-9 rounded-md px-2.5 py-1.5 text-[11px] font-bold border border-white/15 text-white/70 hover:bg-white/10 transition"
              >
                ▶
              </button>
            )}
            {onDeleteTake && (
              <button
                type="button"
                onClick={onDeleteTake}
                title="Delete take"
                className="min-h-9 min-w-9 rounded-md px-2.5 py-1.5 text-[11px] font-bold border border-red-500/30 text-red-400 hover:bg-red-500/10 transition"
              >
                🗑
              </button>
            )}
          </div>
        )}

        <div className={`grid gap-2 ${compact ? "sm:grid-cols-1" : "sm:grid-cols-3"} sm:items-center`}>
          <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/50">
            Input
            <input
              type="range"
              min={-24}
              max={12}
              step={0.5}
              value={track.inputGainDb ?? -6}
              onChange={(e) => onInputGain(Number(e.target.value))}
              className="flex-1 accent-amber-400"
              title="Mic input trim — lower if the mic is too hot"
            />
            <span className="w-10 text-right font-mono text-[10px] tabular-nums text-amber-300/85">
              {(track.inputGainDb ?? -6).toFixed(1)}
            </span>
          </label>

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

      {!compact && peaks.length > 0 && (
        <div className="mt-3">
          <WaveformView
            peaks={peaks}
            color={track.color}
            progress={progress}
            durationSec={track.durationSec}
            onScrub={onSeek}
          />
        </div>
      )}

      {!compact && midiClip && (
        <div className="mt-3">
          <PianoRoll clip={midiClip} color={track.color} positionBeats={positionBeats} />
        </div>
      )}

      {!compact && (
        <FxPanel
          fx={track.fx}
          sidechainFromId={track.sidechainFromId}
          sidechainAmount={track.sidechainAmount}
          sidechainOptions={sidechainOptions}
          onSetEq={onSetEq}
          onSetComp={onSetComp}
          onSetVocalBus={onSetVocalBus}
          onSetReverb={onSetReverb}
          onSetDelay={onSetDelay}
          onSetSidechain={onSetSidechain}
        />
      )}
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
