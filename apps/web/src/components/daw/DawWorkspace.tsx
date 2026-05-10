"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type AuxBusState,
  type BeatMachineState,
  DawEngine,
  type EngineSnapshot,
  type LaneEqRecommendation,
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
  suggestPattern,
  trapDemoPattern,
  type BeatPattern,
  type DrumKind,
  type DrumKitId,
} from "./beatMachine";
import BeatMachineGrid from "./BeatMachineGrid";
import CollaboratorInvitePanel, { type CollaboratorPresenceRecord } from "./CollaboratorInvitePanel";
import FxPanel from "./FxPanel";
import GearRack, { type GearApplyHandlers } from "./GearRack";
import MasterPublishBar from "./MasterPublishBar";
import PianoRoll from "./PianoRoll";
import ProjectMenu from "./ProjectMenu";
import WaveformView from "./WaveformView";
import {
  Fader,
  Knob,
  RackPanel,
  ToggleSwitch,
  VUMeter,
} from "@/components/studio";
import {
  deleteProject,
  listProjects,
  loadProject,
  newProjectId,
  saveProject,
  syncProjectToServer,
  setProjectPublic,
} from "./projectStorage";
import {
  popUndoSnapshot,
  pushUndoSnapshot,
} from "./undoStorage";
import { CHANNELS, createBrowserSupabaseClient } from "@/lib/supabase";
import { useSession } from "next-auth/react";
import { StudioTooltip, StudioTooltipProvider } from "@/components/ui/StudioTooltip";
import { tooltips } from "./tooltipCopy";
import { setStudioContext, clearStudioContext } from "@/lib/studioContextStore";
import { curatedTrapDemo } from "./demoSessions";
import { aiToolSchemas, type AiToolName } from "@/lib/aiTools";
import {
  startYjsCollab,
  setSharedField,
  setSharedBeatStep,
  getSharedProject,
} from "@/lib/yjsBridge";

const MasterPanel = dynamic(() => import("./MasterPanel"), { ssr: false });
const StemLoopBrowser = dynamic(() => import("./StemLoopBrowser"), { ssr: false });
const SampleLibraryPanel = dynamic(() => import("./SampleLibraryPanel"), { ssr: false });
const ProducerKitUploader = dynamic(() => import("./ProducerKitUploader"), { ssr: false });
const OpenStudioSessionsPanel = dynamic(() => import("./OpenStudioSessionsPanel"), { ssr: false });
const MidiPanel = dynamic(() => import("./MidiPanel"), { ssr: false });
const AudioSettingsPanel = dynamic(() => import("./AudioSettingsPanel"), { ssr: false });
const StudioDropOverlay = dynamic(() => import("./StudioDropOverlay"), { ssr: false });
const ShortcutOverlay = dynamic(() => import("./ShortcutOverlay"), { ssr: false });
const VoiceToMidiButton = dynamic(() => import("./VoiceToMidiButton"), { ssr: false });

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
  /** Optional inline action — e.g. an "Undo" button on a destructive
   *  notice. Clicking calls onAction() and dismisses the notice. */
  action?: { label: string; onAction: () => void };
};

type RecordReviewState = {
  trackId: TrackId;
  durationSec: number;
  deleted: boolean;
};

type LoudnessTarget = -16 | -14 | -10;
type ExportLoudnessPreset = "streaming" | "club" | "broadcast";
type ExportTruePeakTarget = -1 | -1.2 | -2;

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
  /** Per-collaborator cursor: track they're focused on + playhead. Optional
   *  so older clients on the channel still parse. */
  focusedTrackId?: string | null;
  playheadSec?: number | null;
  /** Stable hue (0..360) so each collaborator gets a consistent color
   *  across all surfaces — focus ring on the track, dot on the timeline. */
  hue?: number;
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

function CommentPinsStrip(props: {
  comments: StudioComment[];
  positionSec: number;
  durationSec: number;
  onSeek: (sec: number) => void;
  collaborators: CollaboratorPresence[];
  selfId: string;
}) {
  return CommentPinsStripImpl(props);
}

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

/** Stable hue derived from a presence id — same id always lands on the
 *  same color across the studio surface (focus ring, timeline dot). */
function hueForPresenceId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
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
  // Derived from snapshot; declared early because several effects depend on it.
  const transport = snapshot?.transport;
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
  /** Tracks unsaved changes since the last successful save. Used by #8
   *  auto-save and the multi-tab conflict notice. Mutating callbacks
   *  flip it via touchDirty(); save resets it back to false. */
  const [dirty, setDirty] = useState(false);
  /** Reflects the StudioProject row's isPublic flag. Drives the share
   *  link UI in MasterPublishBar (#9). Defaults to false; flipped via
   *  setProjectPublic API call. */
  const [projectIsPublic, setProjectIsPublic] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const touchDirty = useCallback(() => {
    if (!dirtyRef.current) setDirty(true);
  }, []);
  const [tapFlash, setTapFlash] = useState<number | null>(null);
  const [manualBpmInput, setManualBpmInput] = useState("90");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [mobileDawBannerDismissed, setMobileDawBannerDismissed] = useState(false);
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
  const [trackChords, setTrackChords] = useState<Record<string, string[]>>({});
  const [isAutosaving, setIsAutosaving] = useState(false);
  const [autosaveError, setAutosaveError] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [postingForum, setPostingForum] = useState(false);
  const [auditEvents, setAuditEvents] = useState<StudioAuditEvent[]>([]);
  const [comments, setComments] = useState<StudioComment[]>([]);
  const [recordReview, setRecordReview] = useState<RecordReviewState | null>(null);
  const [compactStrips, setCompactStrips] = useState(false);
  const [showRecordWizard, setShowRecordWizard] = useState(true);
  const [heavyUiReady, setHeavyUiReady] = useState(false);
  const [loudnessTarget, setLoudnessTarget] = useState<LoudnessTarget>(-14);
  const [exportLoudnessPreset, setExportLoudnessPreset] = useState<ExportLoudnessPreset>("streaming");
  const [exportTruePeakTarget, setExportTruePeakTarget] = useState<ExportTruePeakTarget>(-1);
  const [recentlyAppliedLanes, setRecentlyAppliedLanes] = useState<Set<DrumKind>>(new Set());
  const [recommendationConfidenceThreshold, setRecommendationConfidenceThreshold] = useState(0.4);
  const [previewRecommendation, setPreviewRecommendation] = useState<LaneEqRecommendation | null>(null);
  const referenceInputRef = useRef<HTMLInputElement | null>(null);
  const addSoundsInputRef = useRef<HTMLInputElement | null>(null);
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
          focusedTrackId: null,
          playheadSec: null,
          hue: hueForPresenceId(clientPresenceId),
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
      focusedTrackId: null,
      playheadSec: null,
      hue: hueForPresenceId(clientPresenceId),
    } satisfies CollaboratorPresence);
  }, [focusMode, clientPresenceId, heavyUiReady]);

  // Broadcast my focused track + playhead so other collaborators see my
  // cursor on the timeline. Throttled by the snapshot tick so we don't
  // spam the channel on every animation frame.
  useEffect(() => {
    if (!heavyUiReady) return;
    const channel = presenceChannelRef.current;
    if (!channel) return;
    void channel.track({
      id: clientPresenceId,
      name: displayNameRef.current,
      focusMode: focusModeRef.current,
      isPlaying: Boolean(transport?.isPlaying),
      updatedAt: new Date().toISOString(),
      focusedTrackId: focusedId ?? null,
      playheadSec: typeof transport?.positionSec === "number" ? transport.positionSec : null,
      hue: hueForPresenceId(clientPresenceId),
    } satisfies CollaboratorPresence);
  }, [
    heavyUiReady,
    clientPresenceId,
    focusedId,
    transport?.isPlaying,
    // Use whole seconds for the dependency to throttle channel writes.
    Math.floor((transport?.positionSec ?? 0) * 2),
  ]);

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
    const key = "ems-studio-mobile-banner-dismissed-v1";
    const dismissed = safeLocalStorageGet(key);
    setMobileDawBannerDismissed(dismissed === "1");
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
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

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

  const tracks = useMemo(() => snapshot?.tracks ?? [], [snapshot]);
  const beat = snapshot?.beat;
  const laneEqRecommendations = useMemo(() => {
    const engine = engineRef.current;
    if (!engine || !beat) return [];
    return engine.analyzeBeatPatternConflicts();
  }, [beat]);
  const laneTopRecommendations = useMemo(() => {
    const top: Partial<Record<DrumKind, LaneEqRecommendation>> = {};
    for (const rec of laneEqRecommendations) {
      if (rec.type === "retune") continue;
      if (rec.confidence < recommendationConfidenceThreshold) continue;
      const current = top[rec.lane];
      if (!current || rec.confidence > current.confidence) {
        top[rec.lane] = rec;
      }
    }
    return top;
  }, [laneEqRecommendations, recommendationConfidenceThreshold]);

  const filteredLaneEqRecommendations = useMemo(() => {
    return laneEqRecommendations.filter((rec) => rec.confidence >= recommendationConfidenceThreshold);
  }, [laneEqRecommendations, recommendationConfidenceThreshold]);
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

  // Publish a snapshot of the studio session to the shared store so the
  // global ChatbotWidget can answer questions like "what does this knob
  // do?" with the user's current BPM, kit, and selected track in mind.
  useEffect(() => {
    const lastAction = auditEvents[0]?.detail ?? null;
    setStudioContext({
      route: typeof window !== "undefined" ? window.location.pathname : "",
      bpm: transport?.bpm ?? null,
      trackCount: tracks.length,
      armedTracks: tracks.filter((t) => t.armed).length,
      hasRecordedAudio: tracks.some((t) => t.hasAudio),
      beatKit: snapshot?.beat?.kit ?? null,
      beatEnabled: snapshot?.beat?.enabled ?? false,
      selectedTrackName: focusedTrack?.name ?? null,
      lastAction,
      guestMode: isGuest,
    });
    return () => {
      // Only clear when this component unmounts — leaves the snapshot in
      // place while the user is in the studio.
      clearStudioContext();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    transport?.bpm,
    tracks,
    snapshot?.beat?.kit,
    snapshot?.beat?.enabled,
    focusedTrack?.name,
    auditEvents,
    isGuest,
  ]);

  // Auto-save (#8). Every 60s, if the session has been edited since the
  // last save AND has a project id (i.e. user has saved at least once),
  // run a silent save. Skipped when the engine isn't initialized so we
  // don't burn cycles on an empty workspace.
  useEffect(() => {
    if (!projectId) return;
    const interval = window.setInterval(() => {
      if (!dirtyRef.current) return;
      const engine = engineRef.current;
      if (!engine) return;
      void (async () => {
        try {
          const file = await engine.serializeProject();
          await saveProject(projectId, projectName, file);
          setDirty(false);
          if (session?.user?.id) {
            void syncProjectToServer(projectId, projectName, file, null);
          }
        } catch (err) {
          console.warn("[DawWorkspace] auto-save failed", err);
        }
      })();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [projectId, projectName, session?.user?.id]);

  // Yjs CRDT collab (#10). When a project has an id, bridge the engine's
  // parameter state (BPM, kit, beat steps) with a Y.Doc shared over a
  // Supabase realtime channel. Two clients editing the same project see
  // each other's edits within ~300ms; CRDT semantics guarantee
  // convergence even when both edit the same step at the same time.
  useEffect(() => {
    if (!projectId) return;
    const handle = startYjsCollab(projectId);
    const map = getSharedProject(handle.doc);
    let suppressLocalEcho = false;

    function onRemoteChange() {
      if (suppressLocalEcho) return;
      const engine = engineRef.current;
      if (!engine) return;
      const remoteBpm = map.get("bpm");
      if (typeof remoteBpm === "number" && remoteBpm !== transportBpmRef.current) {
        engine.setBpm(remoteBpm);
        setManualBpmInput(String(remoteBpm));
      }
      const remoteKit = map.get("beatKit");
      if (
        typeof remoteKit === "string" &&
        remoteKit !== beatKitRef.current
      ) {
        engine.setBeatKit(remoteKit as Parameters<typeof engine.setBeatKit>[0]);
      }
      const remoteEnabled = map.get("beatEnabled");
      if (
        typeof remoteEnabled === "boolean" &&
        remoteEnabled !== beatEnabledRef.current
      ) {
        engine.setBeatEnabled(remoteEnabled);
      }
      const remoteSteps = map.get("beatSteps") as
        | Record<string, boolean>
        | undefined;
      if (remoteSteps) {
        for (const [key, on] of Object.entries(remoteSteps)) {
          const [lane, stepStr] = key.split(":");
          const step = Number(stepStr);
          if (!lane || Number.isNaN(step)) continue;
          engine.setBeatStep(
            lane as Parameters<typeof engine.setBeatStep>[0],
            step,
            on,
          );
        }
      }
    }

    map.observe(onRemoteChange);

    // Bridge local toggles → Y. We listen to the same custom event the
    // beat grid already dispatches… actually the beat grid calls
    // engine.setBeatStep directly, not via an event. Simpler approach:
    // subscribe to the engine's emitter via the existing snapshot stream.
    // We don't have one for individual fields, so we hook into the
    // "studio:share-step" event here and dispatch from the toggle path.
    function onShareStep(event: Event) {
      const detail = (event as CustomEvent<{
        lane: string;
        step: number;
        on: boolean;
      }>).detail;
      if (!detail) return;
      suppressLocalEcho = true;
      setSharedBeatStep(handle.doc, detail.lane, detail.step, detail.on);
      suppressLocalEcho = false;
    }
    function onShareField(event: Event) {
      const detail = (event as CustomEvent<{
        key: "bpm" | "beatKit" | "beatEnabled";
        value: unknown;
      }>).detail;
      if (!detail) return;
      suppressLocalEcho = true;
      setSharedField(handle.doc, detail.key, detail.value as never);
      suppressLocalEcho = false;
    }
    window.addEventListener("studio:share-step", onShareStep);
    window.addEventListener("studio:share-field", onShareField);

    return () => {
      window.removeEventListener("studio:share-step", onShareStep);
      window.removeEventListener("studio:share-field", onShareField);
      map.unobserve(onRemoteChange);
      handle.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Refs let the Y.observe callback above read live values without
  // re-subscribing on every render.
  const transportBpmRef = useRef<number | null>(null);
  transportBpmRef.current = transport?.bpm ?? null;
  const beatKitRef = useRef<string | null>(null);
  beatKitRef.current = snapshot?.beat?.kit ?? null;
  const beatEnabledRef = useRef<boolean | null>(null);
  beatEnabledRef.current = snapshot?.beat?.enabled ?? null;

  // Conflict resolution: another tab saved this same project. Surface a
  // notice so the user can pick which version to keep.
  useEffect(() => {
    if (!projectId) return;
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("ems-studio");
    } catch {
      return; // unsupported
    }
    function onMsg(event: MessageEvent<{ type?: string; id?: string; savedAt?: string }>) {
      const data = event.data;
      if (!data || data.type !== "project:saved" || data.id !== projectId) return;
      if (!dirtyRef.current) return;
      setNotice({
        tone: "warning",
        message: "Another tab saved this project. You have unsaved edits here.",
        action: {
          label: "Discard mine, load theirs",
          onAction: () => void handleLoad(projectId),
        },
      });
    }
    channel.addEventListener("message", onMsg);
    return () => {
      channel?.removeEventListener("message", onMsg);
      channel?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Demo-session loader. The DemoSessionOverlay (rendered in StudioTryClient)
  // dispatches studio:load-demo with detail.kind = "curated" | "random". We
  // listen here because the engine instance lives in this component.
  useEffect(() => {
    function onLoadDemo(event: Event) {
      const detail = (event as CustomEvent<{ kind: "curated" | "random" }>).detail;
      if (!ensureInit()) return;
      const engine = engineRef.current;
      if (!engine) return;
      let label: string;
      if (detail?.kind === "curated") {
        const demo = curatedTrapDemo();
        engine.setBeatKit(demo.kit);
        engine.setBeatPattern(demo.pattern);
        engine.setBpm(demo.bpm);
        engine.setBeatEnabled(true);
        label = demo.label;
        // If the curated demo has hand-mixed stems, decode them in
        // parallel and drop one track per stem on top of the beat
        // machine. Failures are silent — the synth-rendered beat is the
        // safety net.
        if (demo.stems && demo.stems.length > 0) {
          const ctx = engine.audioContext;
          if (ctx) {
            void Promise.all(
              demo.stems.map(async (stem) => {
                try {
                  const res = await fetch(stem.url);
                  if (!res.ok) return null;
                  const arr = await res.arrayBuffer();
                  const buf = await ctx.decodeAudioData(arr);
                  return { stem, buf };
                } catch {
                  return null;
                }
              }),
            ).then((stems) => {
              const liveEngine = engineRef.current;
              if (!liveEngine) return;
              for (const entry of stems) {
                if (!entry) continue;
                const trackId = liveEngine.addTrack(entry.stem.name, entry.stem.color);
                liveEngine.setTrackBuffer(trackId, entry.buf);
              }
            });
          }
        }
      } else {
        const surprise = surpriseSession();
        engine.setBeatKit(surprise.kit);
        engine.setBeatPattern(surprise.pattern);
        engine.setBpm(surprise.bpm);
        engine.setBeatEnabled(true);
        label = surprise.label;
      }
      setNotice({ tone: "info", message: `✨ Loaded ${label} — press play.` });
      pushAuditEvent("beat", `Demo loaded · ${label}`);
      const prefersMotion =
        typeof window !== "undefined" &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (prefersMotion && !transport?.isPlaying) {
        void engine.play();
      }
    }
    window.addEventListener("studio:load-demo", onLoadDemo);
    return () => window.removeEventListener("studio:load-demo", onLoadDemo);
    // ensureInit and engineRef are stable; transport.isPlaying is read at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // AI tool-call executor (#3). The Coach proposes actions via the
  // streaming `tool` events; the user opts in via the confirm card in
  // ChatbotWidget; that fires `studio:execute-tool` with name + args.
  // We validate args against the published schema before touching the
  // engine — the chat surface is essentially untrusted input.
  useEffect(() => {
    function onExecuteTool(event: Event) {
      const detail = (event as CustomEvent<{ name?: string; args?: unknown }>).detail;
      if (!detail?.name) return;
      const name = detail.name as AiToolName;
      const schema = aiToolSchemas[name];
      if (!schema) {
        console.warn("[ai-tool] unknown tool", detail.name);
        return;
      }
      const parsed = schema.safeParse(detail.args);
      if (!parsed.success) {
        console.warn("[ai-tool] invalid args", detail.name, parsed.error.issues);
        setNotice({
          tone: "warning",
          message: "The Coach tried to do something that didn't validate. Skipped.",
        });
        return;
      }
      const engine = engineRef.current;
      if (!engine) return;
      try {
        switch (name) {
          case "setBpm": {
            const args = parsed.data as { bpm: number };
            engine.setBpm(args.bpm);
            setManualBpmInput(String(args.bpm));
            touchDirty();
            setNotice({ tone: "success", message: `Coach set BPM to ${args.bpm}.` });
            break;
          }
          case "setTrackEq": {
            const args = parsed.data as {
              trackName: string;
              band: "low" | "mid" | "high";
              db: number;
            };
            const target = tracks.find(
              (t) => t.name.toLowerCase() === args.trackName.toLowerCase(),
            );
            if (!target) {
              setNotice({
                tone: "warning",
                message: `No track named "${args.trackName}" — skipped.`,
              });
              break;
            }
            engine.setTrackEq(target.id, args.band, args.db);
            touchDirty();
            const sign = args.db >= 0 ? "+" : "";
            setNotice({
              tone: "success",
              message: `Coach set ${args.band} EQ on "${target.name}" to ${sign}${args.db.toFixed(1)} dB.`,
            });
            break;
          }
          case "applyMasteringPreset": {
            const args = parsed.data as {
              preset:
                | "streamReady"
                | "loudClub"
                | "podcast"
                | "balancedAcoustic"
                | "flat";
            };
            engine.applyMasteringPreset?.(args.preset);
            touchDirty();
            setNotice({ tone: "success", message: `Coach applied ${args.preset} master.` });
            break;
          }
          case "loadDemo": {
            const args = parsed.data as { kind: "curated" | "random" };
            window.dispatchEvent(
              new CustomEvent("studio:load-demo", { detail: { kind: args.kind } }),
            );
            break;
          }
          case "setBeatKit": {
            const args = parsed.data as { kit: string };
            engine.setBeatKit(args.kit as Parameters<typeof engine.setBeatKit>[0]);
            touchDirty();
            setNotice({ tone: "success", message: `Coach switched kit to ${args.kit}.` });
            break;
          }
          case "armTrack": {
            const args = parsed.data as { trackName: string; armed?: boolean };
            const target = tracks.find(
              (t) => t.name.toLowerCase() === args.trackName.toLowerCase(),
            );
            if (!target) {
              setNotice({
                tone: "warning",
                message: `No track named "${args.trackName}" — skipped.`,
              });
              break;
            }
            const armed = args.armed !== false;
            engine.setTrackArmed(target.id, armed);
            touchDirty();
            setNotice({
              tone: "success",
              message: `Coach ${armed ? "armed" : "disarmed"} "${target.name}".`,
            });
            break;
          }
        }
      } catch (err) {
        console.warn("[ai-tool] execution failed", name, err);
      }
    }
    window.addEventListener("studio:execute-tool", onExecuteTool);
    return () => window.removeEventListener("studio:execute-tool", onExecuteTool);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks]);

  // Per-track pitch correction (#13). Applied non-destructively: we
  // read the buffer, run the soft PSOLA-lite, and write it back via
  // setTrackBuffer. The effect is irreversible-on-the-track (no undo
  // here yet), so we surface a clear notice with the option to retake.
  useEffect(() => {
    function onTuneTrack(event: Event) {
      const detail = (event as CustomEvent<{ trackId?: string }>).detail;
      if (!detail?.trackId) return;
      const engine = engineRef.current;
      const ctx = engine?.audioContext;
      if (!engine || !ctx) return;
      const buffer = engine.getTrackBuffer(detail.trackId);
      const track = tracks.find((t) => t.id === detail.trackId);
      if (!buffer || !track) {
        setNotice({
          tone: "warning",
          message: "Pitch-correction needs an audio take first.",
        });
        return;
      }
      setNotice({ tone: "info", message: `Tuning "${track.name}"…` });
      void (async () => {
        try {
          const { applyPitchCorrection } = await import("@/lib/pitchCorrect");
          const corrected = applyPitchCorrection(buffer, ctx, {
            key: "C",
            amount: 0.6,
          });
          engine.setTrackBuffer(detail.trackId!, corrected);
          touchDirty();
          setNotice({
            tone: "success",
            message: `Tuned "${track.name}" to C major. Re-record if it sounds off.`,
          });
        } catch (err) {
          console.warn("[pitchCorrect] failed", err);
          setNotice({ tone: "error", message: "Pitch correction failed." });
        }
      })();
    }
    window.addEventListener("studio:tune-track", onTuneTrack);
    return () => window.removeEventListener("studio:tune-track", onTuneTrack);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks]);

  const reviewTrack = useMemo(
    () => (recordReview ? tracks.find((track) => track.id === recordReview.trackId) ?? null : null),
    [recordReview, tracks],
  );

  useEffect(() => {
    if (typeof transport?.bpm !== "number") return;
    setManualBpmInput(String(transport.bpm));
  }, [transport?.bpm]);

  // Live-session heartbeat — pings /api/studio/heartbeat every 30 s so the
  // production timeline can set isLiveNow for this user's posts.
  useEffect(() => {
    // Guest sessions have no authenticated studio identity, so heartbeat
    // endpoints return 401 and spam the console without adding value.
    if (isGuest) return;

    const ping = () => { void fetch("/api/studio/heartbeat", { method: "POST" }); };
    ping(); // immediate ping on mount
    const id = setInterval(ping, 30_000);

    const onHide = () => { void fetch("/api/studio/heartbeat", { method: "DELETE" }); };
    document.addEventListener("visibilitychange", onHide);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onHide);
      onHide();
    };
  }, []);

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

  const applyKick808SplitPreset = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.applyBeatAntiOverlapPreset("kick808-split");
    setNotice({
      tone: "success",
      message: "Applied kick/808 split template: kick punch band + controlled 808 sub lane.",
    });
  }, []);

  const applyPercussionLowCutTemplate = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.applyBeatAntiOverlapPreset("percussion-lowcut");
    setNotice({
      tone: "success",
      message: "Applied percussion low-cut template across snare, clap, hats, perc, and crash.",
    });
  }, []);

  const clearBeatEqTemplates = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.clearBeatLaneEqTemplates();
    setNotice({ tone: "info", message: "Cleared beat lane EQ templates." });
  }, []);

  const applyLaneEqRecommendation = useCallback((rec: LaneEqRecommendation) => {
    const engine = engineRef.current;
    if (!engine) return;
    if (rec.type === "retune") {
      setNotice({
        tone: "info",
        message: `Retune suggestion: move ${rec.lane.toUpperCase()} center toward ${Math.round(rec.valueHz)} Hz.`,
      });
      return;
    }
    if (rec.type === "hp") engine.setBeatLaneEq(rec.lane, { hpHz: rec.valueHz });
    if (rec.type === "lp") engine.setBeatLaneEq(rec.lane, { lpHz: rec.valueHz });

    // Visual feedback: flash the lane
    setRecentlyAppliedLanes((prev) => {
      const next = new Set(prev);
      next.add(rec.lane);
      return next;
    });
    setTimeout(() => {
      setRecentlyAppliedLanes((prev) => {
        const next = new Set(prev);
        next.delete(rec.lane);
        return next;
      });
    }, 600);

    setNotice({
      tone: "success",
      message: `Applied ${rec.type.toUpperCase()} ${Math.round(rec.valueHz)} Hz on ${rec.lane.toUpperCase()}.`,
    });
  }, []);

  const buildBestActionableLaneEqRecommendations = useCallback(
    (recommendations: LaneEqRecommendation[]) => {
      const actionable = recommendations.filter((rec) => rec.type === "hp" || rec.type === "lp");
      const bestByKey = new Map<string, LaneEqRecommendation>();

      for (const rec of actionable) {
        const key = `${rec.lane}:${rec.type}`;
        const current = bestByKey.get(key);
        if (!current || rec.confidence > current.confidence) {
          bestByKey.set(key, rec);
        }
      }

      return Array.from(bestByKey.values()).sort((a, b) => b.confidence - a.confidence);
    },
    [],
  );

  const applyAllLaneEqRecommendations = useCallback(() => {
    const bestActionable = buildBestActionableLaneEqRecommendations(laneEqRecommendations);
    if (!bestActionable.length) {
      setNotice({ tone: "info", message: "No actionable lane EQ recommendations to apply." });
      return;
    }

    const engine = engineRef.current;
    if (!engine) return;

    for (const rec of bestActionable) {
      if (rec.type === "hp") engine.setBeatLaneEq(rec.lane, { hpHz: rec.valueHz });
      if (rec.type === "lp") engine.setBeatLaneEq(rec.lane, { lpHz: rec.valueHz });
    }

    setNotice({
      tone: "success",
      message: `Applied ${bestActionable.length} best-fit lane EQ recommendation${bestActionable.length === 1 ? "" : "s"}.`,
    });
  }, [buildBestActionableLaneEqRecommendations, laneEqRecommendations]);
  const togglePreviewRecommendation = useCallback((rec: LaneEqRecommendation | null) => {
    const engine = engineRef.current;
    if (!engine) return;
    
    if (rec === null) {
      setPreviewRecommendation(null);
      return;
    }

    if (previewRecommendation?.lane === rec.lane && previewRecommendation?.type === rec.type) {
      setPreviewRecommendation(null);
      if (snapshot?.beat.laneEqSettings) {
        const current = snapshot.beat.laneEqSettings[rec.lane];
        if (current) {
          engine.setBeatLaneEq(rec.lane, current);
        }
      }
    } else {
      setPreviewRecommendation(rec);
      if (rec.type !== "retune") {
        if (rec.type === "hp") engine.setBeatLaneEq(rec.lane, { hpHz: rec.valueHz });
        if (rec.type === "lp") engine.setBeatLaneEq(rec.lane, { lpHz: rec.valueHz });
      }
    }
  }, [previewRecommendation, snapshot?.beat.laneEqSettings]);


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
      setDirty(false);

      // Write-through to the server so the project resumes on a fresh
      // device / browser. Best-effort — guests stay local-only, signed-in
      // users get cross-device sync. Failures don't block local save.
      if (session?.user?.id) {
        // Master thumbnail peaks aren't yet exposed by the engine; we
        // pass null and the hub falls back to placeholder bars. Wire
        // engine.getMasterThumbnailPeaks() when available.
        void syncProjectToServer(id, name, file, null).then((result) => {
          if (!result.ok) {
            console.warn("[DawWorkspace] remote sync failed", result.reason);
          } else {
            // Broadcast the save to other tabs (#8 conflict resolution).
            try {
              const channel = new BroadcastChannel("ems-studio");
              channel.postMessage({
                type: "project:saved",
                id,
                savedAt: file.savedAt,
              });
              channel.close();
            } catch {
              // BroadcastChannel unsupported (older Safari); ignore.
            }
          }
        });
      }
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
    setIsAutosaving(true);
    try {
      const file = await engine.serializeProject();
      const id = projectId ?? newProjectId();
      const name = projectName.trim() || "Untitled session";
      await saveProject(id, name, file);
      const versionId = `${id}__v_${Date.now()}`;
      await saveProject(versionId, `${name} [v${new Date().toLocaleTimeString()}]`, file);
      if (!projectId) setProjectId(id);
      setLastAutosaveAt(Date.now());
      setAutosaveError(false);
      pushAuditEvent("autosave", `Autosaved "${name}"`);
    } catch {
      // Quiet on the audit log to avoid interrupting recording flow,
      // but surface to the SyncBadge so the user knows their work
      // didn't make it to disk.
      setAutosaveError(true);
    } finally {
      setIsAutosaving(false);
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

  // ── Undo: snapshot capture + Cmd/Ctrl+Z handler ─────────────────────────
  // Coarse-grained reload-survivable undo. Debounces to ~3s of idle so
  // dragging a knob doesn't spam the IDB stack with mid-gesture frames.
  // Snapshots live in IDB, so undo works after a tab close / refresh.
  useEffect(() => {
    if (!snapshot) return;
    if (!projectId) return;
    const engine = engineRef.current;
    if (!engine) return;
    const timer = window.setTimeout(async () => {
      try {
        const file = await engine.serializeProject();
        await pushUndoSnapshot(projectId, file, "Edit");
      } catch {
        // Silent — losing one undo frame is preferable to interrupting
        // the user with an error toast.
      }
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [
    projectId,
    snapshot,
    transport?.bpm,
    transport?.masterDb,
    transport?.masterEqLowDb,
    transport?.masterEqMidDb,
    transport?.masterEqHighDb,
    laneSampleSignature,
    beat?.kit,
  ]);

  const performUndo = useCallback(async () => {
    if (!projectId) {
      setNotice({ tone: "info", message: "Nothing to undo yet — make an edit first." });
      return;
    }
    const engine = engineRef.current;
    if (!engine) return;
    try {
      const previous = await popUndoSnapshot(projectId);
      if (!previous) {
        setNotice({ tone: "info", message: "No earlier state to restore." });
        return;
      }
      await engine.hydrateProject(previous.file);
      pushAuditEvent("load", `Undid last edit (restored to ${new Date(previous.file.savedAt).toLocaleTimeString()})`);
      setNotice({ tone: "success", message: "Undid last edit." });
    } catch {
      setNotice({ tone: "error", message: "Couldn't undo (storage error)." });
    }
  }, [projectId, pushAuditEvent]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Don't hijack undo inside text inputs — let the browser handle
      // text-edit undo there.
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      // Don't hijack undo while a modal/dialog is open. Hydrating the
      // engine while a dialog is rendered against stale state would
      // desync UI and engine. We don't have any role="dialog" modals
      // in the DAW today, but this is the safe place to gate it.
      if (target && typeof target.closest === "function" && target.closest('[role="dialog"]')) {
        return;
      }
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && !e.shiftKey && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        void performUndo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [performUndo]);

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
    touchDirty();
    window.dispatchEvent(
      new CustomEvent("studio:share-field", {
        detail: { key: "bpm", value: clamped },
      }),
    );
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
      const engine = engineRef.current;

      // Cmd+Y: Apply top recommendation (requires meta/ctrl)
      if ((e.metaKey || e.ctrlKey) && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        const topRecs = Object.values(laneTopRecommendations).filter(Boolean);
        if (topRecs.length > 0) {
          const topRec = topRecs.sort((a, b) => (b?.confidence ?? 0) - (a?.confidence ?? 0))[0];
          if (topRec) applyLaneEqRecommendation(topRec);
        }
        return;
      }

      // Cmd+Shift+R: Apply all recommendations (requires meta/ctrl)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        applyAllLaneEqRecommendations();
        return;
      }

      // Cmd+Left / Cmd+Right: cycle lane EQ recommendations and preview each
      if ((e.metaKey || e.ctrlKey) && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        const actionableRecs = buildBestActionableLaneEqRecommendations(filteredLaneEqRecommendations);
        if (!actionableRecs.length) {
          setNotice({ tone: "info", message: "No lane EQ recommendations available to preview." });
          return;
        }

        const currentIndex = actionableRecs.findIndex(
          (rec) => rec.lane === previewRecommendation?.lane && rec.type === previewRecommendation?.type,
        );
        const delta = e.key === "ArrowRight" ? 1 : -1;
        const nextIndex =
          currentIndex === -1
            ? delta > 0
              ? 0
              : actionableRecs.length - 1
            : (currentIndex + delta + actionableRecs.length) % actionableRecs.length;
        const nextRec = actionableRecs[nextIndex];

        togglePreviewRecommendation(nextRec);
        setNotice({
          tone: "info",
          message: `Preview ${nextIndex + 1}/${actionableRecs.length}: ${nextRec.type.toUpperCase()} ${Math.round(nextRec.valueHz)} Hz on ${nextRec.lane.toUpperCase()}.`,
        });
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;
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
  }, [
    transport?.isPlaying,
    transport?.isRecording,
    transport?.loopEnabled,
    transport?.metronomeOn,
    snapshot,
    laneTopRecommendations,
    filteredLaneEqRecommendations,
    applyLaneEqRecommendation,
    buildBestActionableLaneEqRecommendations,
    applyAllLaneEqRecommendations,
    previewRecommendation,
    togglePreviewRecommendation,
  ]);

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
  async function publishMix(
    wav: Blob,
    opts?: { coverArtDataUrl?: string },
  ): Promise<{ ok: boolean; message?: string }> {
    // If the user generated cover art (#5), upload the chosen image to
    // Vercel Blob first so the URL is ready when we patch the project.
    // Failure here is non-fatal — a missing cover doesn't block publish.
    if (opts?.coverArtDataUrl && projectId && session?.user?.id) {
      void (async () => {
        try {
          const res = await fetch(opts.coverArtDataUrl!);
          const blob = await res.blob();
          const { uploadStudioAudio } = await import("@/lib/blobClient");
          const upload = await uploadStudioAudio(
            `studio/${projectId}/cover-${Date.now()}.png`,
            blob,
          );
          await fetch(`/api/studio/projects/${encodeURIComponent(projectId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ coverArtUrl: upload.url }),
          });
        } catch (err) {
          console.warn("[publishMix] cover art persist failed", err);
        }
      })();
    }

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
      // Snapshot the master LUFS so the publish form can persist it on
      // the new Song row. Track page renders this as a stream-readiness
      // signal for license shoppers. Null if the analyser hasn't
      // produced a stable reading yet (e.g. user never played the mix
      // before publishing).
      const lufs = engineRef.current
        ? engineRef.current.getSnapshot().transport.masterLufs
        : Number.NaN;
      const lufsParam = Number.isFinite(lufs) ? `&masterLufs=${encodeURIComponent(lufs.toFixed(2))}` : "";
      const target = `/studio/new?audioUrl=${encodeURIComponent(audioUrl)}&from=board${lufsParam}`;
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
      const wav = await engine.exportWav({ truePeakCeilingDbtp: exportTruePeakTarget });
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
    <StudioTooltipProvider delayDuration={250} skipDelayDuration={500}>
    <div data-studio-content className="relative mx-auto max-w-6xl px-4 pt-6 pb-[calc(env(safe-area-inset-bottom)+5rem)] sm:py-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -top-28 left-8 h-64 w-64 rounded-full bg-cyan-500/12 blur-3xl" />
        <div className="absolute top-24 -right-16 h-72 w-72 rounded-full bg-fuchsia-500/10 blur-3xl" />
        <div className="absolute bottom-20 left-1/4 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      {!mobileDawBannerDismissed && (
        <MobileDawBanner
          onDismiss={() => {
            safeLocalStorageSet("ems-studio-mobile-banner-dismissed-v1", "1");
            setMobileDawBannerDismissed(true);
          }}
        />
      )}

      {!isGuest && showGuide && (
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
            <SyncBadge
              isOnline={isOnline}
              isAutosaving={isAutosaving}
              autosaveError={autosaveError}
              lastAutosaveAt={lastAutosaveAt}
              autosaveOn={autosaveOn}
            />
            <button
              type="button"
              onClick={() => void performUndo()}
              className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs font-bold uppercase tracking-widest text-white/70 hover:bg-white/10 transition"
              title="Undo last edit (⌘/Ctrl+Z) — survives reload"
            >
              ↶ Undo
            </button>
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-400/30 bg-gradient-to-r from-cyan-500/10 via-violet-500/10 to-fuchsia-500/10 px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs">
          <span aria-hidden className="text-cyan-300">⤓</span>
          <span className="font-bold text-white/90">
            Drop your sounds anywhere on the studio
          </span>
          <span className="hidden text-white/45 sm:inline">
            — WAV, MP3, FLAC, AIFF, OGG, M4A
          </span>
        </div>
        <button
          type="button"
          onClick={() => addSoundsInputRef.current?.click()}
          data-tour="add-sounds-cta"
          className="rounded-md bg-cyan-500 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-black transition hover:bg-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-1 focus-visible:ring-offset-black"
        >
          + Add sounds
        </button>
        <input
          ref={addSoundsInputRef}
          type="file"
          accept="audio/*,.wav,.mp3,.m4a,.aif,.aiff,.flac,.ogg"
          multiple
          aria-label="Add audio files to the studio"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) void importSoundKitFiles(files);
            e.currentTarget.value = "";
          }}
        />
      </div>

      <StudioDropOverlay onFiles={importSoundKitFiles} />
      <ShortcutOverlay />

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
          {snapshot?.midi.midiAvailable && (
            <StudioTooltip
              label={
                snapshot.midi.deviceNames.length > 0
                  ? `MIDI controller connected: ${snapshot.midi.deviceNames.join(", ")}`
                  : "Web MIDI access granted — plug in a controller to play."
              }
            >
              <span className="rounded-full border border-tube-300/45 bg-tube-300/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-tube-100">
                ◉ MIDI
              </span>
            </StudioTooltip>
          )}
        </div>

        <StudioTooltip
          label={transport?.isPlaying ? tooltips.transportStop : tooltips.transportPlay}
          shortcut="Space"
        >
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
        </StudioTooltip>

        <StudioTooltip label={tooltips.transportSurprise}>
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
        >
          ✨ Surprise me
        </button>
        </StudioTooltip>

        <StudioTooltip label={tooltips.transportRecord} shortcut="R">
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
          data-tour="record-button"
        >
          <span
            aria-hidden
            className={`h-3 w-3 rounded-full bg-current ${
              transport?.isRecording ? "animate-pulse" : ""
            }`}
          />
          {transport?.isRecording ? "● Recording" : "Record"}
        </button>
        </StudioTooltip>

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
            <StudioTooltip label="Decrease BPM by 1.">
            <button
              type="button"
              onClick={() => nudgeBpm(-1)}
              className="rounded-md border border-white/15 px-2 py-1 text-xs font-bold text-white/80 hover:bg-white/10"
            >
              −
            </button>
            </StudioTooltip>
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
              data-tour="bpm-input"
            />
            <StudioTooltip label="Increase BPM by 1.">
            <button
              type="button"
              onClick={() => nudgeBpm(1)}
              className="rounded-md border border-white/15 px-2 py-1 text-xs font-bold text-white/80 hover:bg-white/10"
            >
              +
            </button>
            </StudioTooltip>
            <StudioTooltip label={tooltips.transportBpmHalf}>
            <button
              type="button"
              onClick={() => applyManualBpmInput(String(Math.max(40, Math.round((transport?.bpm ?? 90) / 2))))}
              className="rounded-md border border-white/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white/70 hover:bg-white/10"
            >
              1/2
            </button>
            </StudioTooltip>
            <StudioTooltip label={tooltips.transportBpmDouble}>
            <button
              type="button"
              onClick={() => applyManualBpmInput(String(Math.min(240, Math.round((transport?.bpm ?? 90) * 2))))}
              className="rounded-md border border-white/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white/70 hover:bg-white/10"
            >
              ×2
            </button>
            </StudioTooltip>
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

        <StudioTooltip label={tooltips.transportTapTempo} shortcut="T">
        <button
          type="button"
          onClick={handleTapTempo}
          className={`rounded-md border px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest transition ${
            tapFlash !== null
              ? "border-accent-400 bg-accent-500/20 text-accent-100"
              : "border-white/15 text-white/65 hover:bg-white/10"
          }`}
        >
          {tapFlash !== null ? `Tap · ${tapFlash}` : "Tap"}
        </button>
        </StudioTooltip>

        <StudioTooltip label={tooltips.transportLoop} shortcut="L">
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
        >
          Loop
        </button>
        </StudioTooltip>

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
          Input Monitor
          <select
            value={transport?.inputMonitorMode ?? "low-latency"}
            onChange={(e) => {
              if (!ensureInit()) return;
              engineRef.current?.setInputMonitorMode(
                e.target.value as "low-latency" | "high-quality",
              );
            }}
            className="rounded-md border border-white/15 bg-black/40 px-2 py-1 text-sm font-semibold"
            title="Low-latency keeps performer monitoring tight; high-quality smooths for mix confidence."
          >
            <option value="low-latency">Low-latency</option>
            <option value="high-quality">High-quality</option>
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

        <label className="flex items-center gap-2 text-xs font-semibold text-white/70">
          <input
            type="checkbox"
            checked={transport?.countInEnabled ?? true}
            onChange={(e) => {
              if (!ensureInit()) return;
              engineRef.current?.setCountIn(
                e.target.checked,
                transport?.countInBars ?? 1,
              );
            }}
            className="accent-accent-400"
          />
          Count-in
          <input
            type="number"
            min={1}
            max={4}
            step={1}
            value={transport?.countInBars ?? 1}
            onChange={(e) => {
              if (!ensureInit()) return;
              engineRef.current?.setCountIn(
                transport?.countInEnabled ?? true,
                Number(e.target.value) === 2 ? 2 : 1,
              );
            }}
            className="w-12 rounded border border-white/15 bg-black/40 px-1.5 py-1 text-right text-xs"
            aria-label="Count-in bars"
          />
          bars
        </label>

        <label className="flex items-center gap-2 text-xs font-semibold text-white/70">
          Pre-roll
          <input
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={(transport?.preRollSec ?? 1.5).toFixed(1)}
            onChange={(e) => {
              if (!ensureInit()) return;
              engineRef.current?.setPreRoll(Number(e.target.value));
            }}
            className="w-14 rounded border border-white/15 bg-black/40 px-1.5 py-1 text-right text-xs"
            aria-label="Pre-roll seconds"
          />
          sec
        </label>

        <label className="flex items-center gap-2 text-xs font-semibold text-white/70">
          <input
            type="checkbox"
            checked={transport?.loopRecordEnabled ?? false}
            onChange={(e) => {
              if (!ensureInit()) return;
              engineRef.current?.setLoopRecording(
                e.target.checked,
                transport?.maxLoopTakes ?? 6,
              );
            }}
            className="accent-cyan-300"
          />
          Loop Rec
          <input
            type="number"
            min={1}
            max={16}
            step={1}
            value={transport?.maxLoopTakes ?? 6}
            onChange={(e) => {
              if (!ensureInit()) return;
              engineRef.current?.setLoopRecording(
                transport?.loopRecordEnabled ?? false,
                Number(e.target.value),
              );
            }}
            className="w-12 rounded border border-white/15 bg-black/40 px-1.5 py-1 text-right text-xs"
            aria-label="Maximum loop takes"
          />
          takes
        </label>

        {Boolean((transport?.countInRemainingBeats ?? 0) > 0) && (
          <span className="rounded-md border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-widest text-amber-100">
            Count-in {transport?.countInRemainingBeats}
          </span>
        )}

        <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-white/60">
          Capture {transport?.captureBackend ?? "mediarecorder"}
        </span>

        <MasterStrip
          db={transport?.masterDb ?? 0}
          level={transport?.masterLevel ?? 0}
          lufs={transport?.masterLufs ?? -60}
          truePeak={transport?.masterTruePeak ?? 0}
          onChange={(db) => {
            if (!ensureInit()) return;
            engineRef.current?.setMasterDb(db);
          }}
        />
      </div>
      </div>

      <p className="-mt-3 mb-3 text-center text-[10px] uppercase tracking-[0.28em] text-white/30">
        Space play · R record · L loop · M metronome · T tap · Home rewind · A-W-S-E-D... play synth · Drop audio on a track to import
      </p>

      <div className="mb-6">
        <AudioSettingsPanel
          ctx={engineRef.current?.audioContext ?? null}
          latencyMode={transport?.latencyMode ?? "recording"}
        />
      </div>

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

      {!showSplash && transport && showMixTools && (
        <div className="mb-5 grid gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 lg:grid-cols-[auto_1fr_auto]">
          <label className="flex items-center gap-2 text-xs font-semibold text-white/70">
            Solo mode
            <select
              value={transport.soloMode}
              onChange={(e) => engineRef.current?.setSoloMode(e.target.value as "sip" | "afl")}
              className="rounded border border-white/15 bg-black/40 px-2 py-1 text-xs"
            >
              <option value="sip">SIP</option>
              <option value="afl">AFL</option>
            </select>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            {transport.vcaGroups.length === 0 && (
              <span className="text-[11px] text-white/45">Assign a track to group A/B/C to create VCA faders.</span>
            )}
            {transport.vcaGroups.map((group) => (
              <label key={group.id} className="flex items-center gap-2 rounded-md border border-white/12 bg-black/25 px-2 py-1 text-[10px] uppercase tracking-wider text-white/65">
                <span className="font-bold">{group.name}</span>
                <input
                  type="range"
                  min={-24}
                  max={12}
                  step={0.5}
                  value={group.gainDb}
                  onChange={(e) => engineRef.current?.setVcaGroupGain(group.id, Number(e.target.value))}
                  className="w-20 accent-cyan-300"
                />
                <span className="w-10 text-right font-mono tabular-nums">{group.gainDb.toFixed(1)}</span>
              </label>
            ))}
          </div>

          <div className="flex items-center gap-2 justify-self-end">
            <input
              ref={referenceInputRef}
              type="file"
              accept="audio/*"
              aria-label="Import reference track"
              title="Import reference track"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                void (async () => {
                  const ok = await engineRef.current?.setReferenceTrack(file);
                  if (!ok) {
                    setNotice({ tone: "error", message: "Couldn't decode reference track." });
                    return;
                  }
                  engineRef.current?.setReferenceEnabled(true);
                  setNotice({ tone: "success", message: "Reference track loaded. A/B enabled." });
                })();
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => referenceInputRef.current?.click()}
              className="rounded border border-white/20 px-2 py-1 text-xs font-semibold text-white/80 hover:bg-white/10"
            >
              Import Ref
            </button>
            <button
              type="button"
              onClick={() => engineRef.current?.setReferenceEnabled(!transport.referenceEnabled)}
              className={`rounded border px-2 py-1 text-xs font-semibold transition ${transport.referenceEnabled ? "border-emerald-300/70 bg-emerald-300/20 text-emerald-100" : "border-white/20 text-white/80 hover:bg-white/10"}`}
            >
              {transport.referenceEnabled ? "Ref B" : "Mix A"}
            </button>
            <label className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-white/55">
              Match
              <input
                type="range"
                min={-24}
                max={12}
                step={0.5}
                value={transport.referenceMatchDb}
                onChange={(e) => engineRef.current?.setReferenceMatchDb(Number(e.target.value))}
                className="w-16 accent-emerald-300"
              />
            </label>
          </div>
        </div>
      )}

      {!showSplash && transport && showMixTools && (
        <AflBusPanel
          mode={transport.soloMode}
          level={transport.aflBusLevel}
        />
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
            <CommentPinsStrip
              comments={comments}
              positionSec={transport?.positionSec ?? 0}
              durationSec={Math.max(
                ...tracks.map((t) => t.durationSec),
                ...comments.map((c) => c.timelineSec ?? 0),
                transport?.loopEndSec ?? 0,
                (transport?.positionSec ?? 0) + 1,
                8,
              )}
              onSeek={(sec: number) => {
                if (!ensureInit()) return;
                engineRef.current?.seek(Math.max(0, sec));
              }}
              collaborators={collaborators}
              selfId={clientPresenceId}
            />
            {tracks.map((track, trackIndex) => (
              <div
                key={track.id}
                data-tour={trackIndex === 0 ? "track-strip" : undefined}
              >
              <TrackStrip
                track={track}
                focused={track.id === focusedId}
                focusedByCollaborators={collaborators
                  .filter((c) => c.id !== clientPresenceId && c.focusedTrackId === track.id)
                  .map((c) => ({ id: c.id, name: c.name, hue: c.hue ?? 200 }))}
                peaks={track.hasAudio ? engineRef.current?.getWaveformPeaks(track.id, 200) ?? [] : []}
                positionSec={transport?.positionSec ?? 0}
                detectedChords={trackChords[track.id] ?? null}
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
                onToggleFreeze={async () => {
                  const engine = engineRef.current;
                  if (!engine) return;
                  if (track.frozen) {
                    const ok = engine.unfreezeTrack(track.id);
                    if (ok) {
                      pushAuditEvent("export", `Unfroze "${track.name}"`);
                      setNotice({ tone: "success", message: `${track.name} unfrozen — FX chain is live again.` });
                    }
                  } else {
                    setNotice({ tone: "info", message: `Freezing ${track.name}…` });
                    const ok = await engine.freezeTrack(track.id);
                    if (ok) {
                      pushAuditEvent("export", `Froze "${track.name}" (FX chain rendered)`);
                      setNotice({ tone: "success", message: `${track.name} frozen — CPU freed.` });
                    } else {
                      setNotice({ tone: "error", message: `Couldn't freeze ${track.name} (no audio?).` });
                    }
                  }
                }}
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
                    setNotice({ tone: "success", message: `Imported into ${track.name}. Analyzing chords…` });
                    // Background chord detection so the import success is
                    // not blocked. ~300ms for a typical 60s clip.
                    setTimeout(() => {
                      const engine = engineRef.current;
                      if (!engine) return;
                      void engine.detectTrackChords(track.id).then((hits) => {
                        const labels = hits.map((h) => h.label).slice(0, 16);
                        setTrackChords((prev) => ({ ...prev, [track.id]: labels }));
                        if (labels.length > 0) {
                          const sample = labels.slice(0, 4).join(" → ");
                          setNotice({
                            tone: "success",
                            message: `Detected chords: ${sample}${labels.length > 4 ? "…" : ""}`,
                          });
                        }
                      });
                    }, 100);
                  }
                  else setNotice({ tone: "error", message: "Couldn't decode that file." });
                }}
                onPreviewTake={track.hasAudio ? () => engineRef.current?.previewTake(track.id) : null}
                onConvertToMidi={track.hasAudio ? () => {
                  const engine = engineRef.current;
                  if (!engine) return;
                  setNotice({ tone: "info", message: `Analyzing ${track.name} for pitches…` });
                  void engine.convertTrackToMidi(track.id).then((clip) => {
                    if (!clip || clip.notes.length === 0) {
                      setNotice({ tone: "warning", message: `No clear pitches found in ${track.name}.` });
                      return;
                    }
                    pushAuditEvent("import", `Converted ${track.name} to MIDI (${clip.notes.length} notes)`);
                    setNotice({
                      tone: "success",
                      message: `Created ${clip.notes.length}-note MIDI clip from ${track.name}. Edit in the piano roll.`,
                    });
                  });
                } : null}
                onDeleteTake={track.hasAudio ? () => {
                  const ok = engineRef.current?.deleteTrackAudio(track.id);
                  if (ok) {
                    setRecordReview({ trackId: track.id, durationSec: track.durationSec, deleted: true });
                    setNotice({
                      tone: "success",
                      message: `Take on "${track.name}" deleted.`,
                      action: { label: "Undo", onAction: () => void performUndo() },
                    });
                  }
                } : null}
                onSeek={(sec) => engineRef.current?.seek(sec)}
                onInputGain={(db) => engineRef.current?.setTrackInputGain(track.id, db)}
                onSelectCompLane={(laneId) => engineRef.current?.setTrackCompLane(track.id, laneId)}
                onSetCompSegment={(segmentIndex, laneId) =>
                  engineRef.current?.setTrackCompSegmentLane(track.id, segmentIndex, laneId)
                }
                vcaGroups={transport?.vcaGroups ?? []}
                soloMode={transport?.soloMode ?? "sip"}
                onSetTrackGroup={(groupId) => engineRef.current?.setTrackGroup(track.id, groupId)}
                onSetAutomationPoint={(lane, timeSec, value) =>
                  engineRef.current?.setTrackAutomationPoint(track.id, lane, timeSec, value)
                }
                onClearAutomation={(lane) => engineRef.current?.clearTrackAutomation(track.id, lane)}
                isRecording={transport?.isRecording ?? false}
                compact={compactStrips}
              />
              </div>
            ))}

            <button
              type="button"
              onClick={() => addSoundsInputRef.current?.click()}
              className="group flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm font-bold uppercase tracking-widest text-white/55 transition hover:border-cyan-400/60 hover:bg-cyan-500/[0.06] hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:ring-offset-1 focus-visible:ring-offset-black"
            >
              <span aria-hidden className="text-lg leading-none">＋</span>
              Add sounds (drag, click, or paste)
            </button>
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
          onApplyKick808Split={applyKick808SplitPreset}
          onApplyPercussionLowCut={applyPercussionLowCutTemplate}
          onClearBeatEqTemplates={clearBeatEqTemplates}
          laneEqRecommendations={laneEqRecommendations}
          onApplyLaneEqRecommendation={applyLaneEqRecommendation}
          onApplyAllLaneEqRecommendations={applyAllLaneEqRecommendations}
          recommendationConfidenceThreshold={recommendationConfidenceThreshold}
          onChangeRecommendationConfidenceThreshold={setRecommendationConfidenceThreshold}
        />
      )}

      {!showSplash && snapshot && showMixTools && <AuxReturnPanel aux={snapshot.aux} />}

      {/* ── Beat Machine ───────────────────────────────────────────────────── */}
      {!showSplash && beat && showArrangeTools && (
        <div className="mb-6" data-tour="beat-grid">
          <BeatMachineGrid
            pattern={beat.pattern}
            enabled={beat.enabled}
            activeStep={beat.activeStep}
            activeBank={beat.activeBank}
            kit={beat.kit}
            laneSampleNames={beat.laneSampleNames}
            laneFrequencyProfiles={beat.laneFrequencyProfiles}
            laneRecommendations={laneTopRecommendations}
            recentlyAppliedLanes={recentlyAppliedLanes}
            onApplyLaneRecommendation={applyLaneEqRecommendation}
            onToggleStep={(lane, step) => {
              const cur = beat.pattern[lane][step];
              engineRef.current?.setBeatStep(lane, step, !cur);
              touchDirty();
              // Broadcast to collaborators via Yjs (#10).
              window.dispatchEvent(
                new CustomEvent("studio:share-step", {
                  detail: { lane, step, on: !cur },
                }),
              );
            }}
            onToggleEnabled={() => engineRef.current?.setBeatEnabled(!beat.enabled)}
            onClear={() => engineRef.current?.setBeatPattern(emptyBeatPattern())}
            onSuggestPattern={() => {
              const engine = engineRef.current;
              if (!engine) return;
              const bpm = transport?.bpm ?? 120;
              const fresh = suggestPattern(beat.kit, bpm);
              // Stream the new pattern in lane-by-lane so the user sees
              // (and hears) the beat being built instead of dumping all
              // 8 lanes at once. Honors prefers-reduced-motion by dropping
              // the whole pattern in one go.
              const reduced =
                typeof window !== "undefined" &&
                window.matchMedia("(prefers-reduced-motion: reduce)").matches;
              if (reduced) {
                engine.setBeatPattern(fresh);
              } else {
                // Clear current pattern first so the reveal is visible.
                engine.setBeatPattern(emptyBeatPattern());
                const lanes = Object.keys(fresh) as Array<keyof typeof fresh>;
                lanes.forEach((lane, laneIdx) => {
                  window.setTimeout(() => {
                    const liveEngine = engineRef.current;
                    if (!liveEngine) return;
                    const row = fresh[lane];
                    row.forEach((on, step) => {
                      if (on) liveEngine.setBeatStep(lane, step, true);
                    });
                  }, laneIdx * 180);
                });
              }
              pushAuditEvent("beat", `Suggested fresh ${beat.kit} pattern @ ${Math.round(bpm)} BPM`);
              setNotice({ tone: "success", message: `New ${beat.kit} pattern. Click again for a different one.` });
            }}
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
            previewRecommendation={previewRecommendation}
            onTogglePreviewRecommendation={togglePreviewRecommendation}
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
        <div className="mb-6 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-tube-300">
                Voice → MIDI
              </p>
              <p className="text-[11px] text-white/55">
                Hum a melody. We turn pitch into notes you can edit.
              </p>
            </div>
            <VoiceToMidiButton
              getCtx={() => engineRef.current?.audioContext ?? null}
              onCaptured={async (buffer) => {
                const engine = engineRef.current;
                if (!engine) return;
                const clip = await engine.convertBufferToMidi(buffer);
                if (!clip) {
                  setNotice({
                    tone: "warning",
                    message:
                      "No clear pitches found — try humming again, louder and steadier.",
                  });
                  return;
                }
                pushAuditEvent(
                  "import",
                  `Voice → MIDI: ${clip.notes.length} notes`,
                );
                setNotice({
                  tone: "success",
                  message: `Captured ${clip.notes.length} notes. Edit them on the piano roll.`,
                });
                touchDirty();
              }}
            />
          </div>
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
        <div className="mb-6" data-tour="master-panel">
          <MasterPanel
            spectrum={transport.masterSpectrum}
            lufs={transport.masterLufs}
            truePeak={transport.masterTruePeak}
            eqLowDb={transport.masterEqLowDb}
            eqMidDb={transport.masterEqMidDb}
            eqHighDb={transport.masterEqHighDb}
            onSetEq={(band, db) => engineRef.current?.setMasterEq(band, db)}
            onApplyMasteringPreset={(preset) => {
              const engine = engineRef.current;
              if (!engine) return;
              const cfg = engine.applyMasteringPreset(preset);
              pushAuditEvent("export", `Applied "${cfg.label}" mastering preset`);
              setNotice({ tone: "success", message: `${cfg.label} chain applied — tweak the EQ to taste.` });
            }}
          />
        </div>
      )}

      {/* ── Master + Publish ───────────────────────────────────────────────── */}
      {!showSplash && transport && showPublishTools && (
        <MasterPublishBar
          limiterOn={transport.masterLimiterOn}
          canExport={canExport}
          emptyReason={emptyExportReason}
          shareLink={
            projectId
              ? {
                  projectId,
                  isPublic: projectIsPublic,
                  onToggle: async (next) => {
                    const ok = await setProjectPublic(projectId, next);
                    if (ok) setProjectIsPublic(next);
                    return ok;
                  },
                }
              : undefined
          }
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
            const predictedPeakDbtp =
              transport.masterTruePeak > 0 ? 20 * Math.log10(transport.masterTruePeak) : -Infinity;
            const predictedAfterLoudness = Number.isFinite(predictedPeakDbtp)
              ? predictedPeakDbtp + correction
              : -Infinity;
            const extraTrimDb = Number.isFinite(predictedAfterLoudness)
              ? Math.min(0, exportTruePeakTarget - predictedAfterLoudness)
              : 0;
            const finalDb = Math.max(-24, Math.min(6, originalDb + correction + extraTrimDb));
            engine.setMasterDb(finalDb);
            let wav: Blob;
            try {
              wav = await engine.exportWav({ truePeakCeilingDbtp: exportTruePeakTarget });
            } finally {
              engine.setMasterDb(originalDb);
            }
            setStats((s) => ({ ...s, exports: s.exports + 1 }));
            pushAuditEvent(
              "export",
              `Exported WAV mixdown (${exportLoudnessPreset}, ceiling ${exportTruePeakTarget.toFixed(1)} dBTP${extraTrimDb < 0 ? `, trim ${extraTrimDb.toFixed(1)} dB` : ""})`,
            );
            return wav;
          }}
          loudnessPreset={exportLoudnessPreset}
          truePeakTarget={exportTruePeakTarget}
          onSetLoudnessPreset={setExportLoudnessPreset}
          onSetTruePeakTarget={setExportTruePeakTarget}
          onPublish={publishMix}
          onAiMaster={aiMasterMix}
          onSharePreview={async (wav) => {
            try {
              const fd = new FormData();
              fd.append("audio", wav, `ems-mix-${Date.now()}.wav`);
              const res = await fetch("/api/guest-share", {
                method: "POST",
                body: fd,
              });
              const json = (await res.json().catch(() => ({}))) as {
                shareUrl?: string;
                error?: string;
              };
              if (!res.ok || !json.shareUrl) {
                return { ok: false, message: json.error ?? `Share failed (${res.status}).` };
              }
              pushAuditEvent("publish", "Created 7-day preview share link");
              return { ok: true, shareUrl: json.shareUrl };
            } catch (err) {
              return {
                ok: false,
                message: err instanceof Error ? err.message : "Share failed.",
              };
            }
          }}
        />
      )}

      {!showSplash && showPublishTools && heavyUiReady && (
        <CollaborationPresencePanel
          selfId={clientPresenceId}
          sessionId={projectId}
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
          onSeekToComment={(sec) => {
            if (!ensureInit()) return;
            engineRef.current?.seek(Math.max(0, sec));
          }}
        />
      )}

      {!showSplash && showPublishTools && heavyUiReady && !isGuest && (
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
              <ShortcutRow combo="Cmd/Ctrl + Y" action="Apply top lane EQ recommendation" />
              <ShortcutRow combo="Cmd/Ctrl + Shift + R" action="Apply all lane EQ recommendations" />
              <ShortcutRow combo="Cmd/Ctrl + ← / →" action="Cycle and preview lane EQ recommendations" />
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
    </StudioTooltipProvider>
  );
}

function MobileDawBanner({ onDismiss }: { onDismiss: () => void }) {
  // Only visible on small screens via responsive classes.
  return (
    <div className="md:hidden sticky top-[64px] z-40 mt-4">
      <div className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 p-4 shadow-xl shadow-black/35">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200/90">
          Phone mode
        </p>
        <p className="mt-1 text-sm font-semibold text-white/85">
          The full Studio board is built for desktop.
        </p>
        <p className="mt-1 text-xs leading-5 text-white/65">
          For quick ideas on mobile, use Phone Studio. You can still stay here if you want.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/studio/try"
            className="rounded-xl bg-cyan-300 px-4 py-2 text-xs font-bold uppercase tracking-wider text-cyan-950 hover:bg-cyan-200"
          >
            Open Phone Studio
          </Link>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold text-white/70 hover:bg-white/10"
          >
            Continue here
          </button>
        </div>
      </div>
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
  onApplyKick808Split,
  onApplyPercussionLowCut,
  onClearBeatEqTemplates,
  laneEqRecommendations,
  onApplyLaneEqRecommendation,
  onApplyAllLaneEqRecommendations,
  recommendationConfidenceThreshold,
  onChangeRecommendationConfidenceThreshold,
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
  onApplyKick808Split: () => void;
  onApplyPercussionLowCut: () => void;
  onClearBeatEqTemplates: () => void;
  laneEqRecommendations: LaneEqRecommendation[];
  onApplyLaneEqRecommendation: (rec: LaneEqRecommendation) => void;
  onApplyAllLaneEqRecommendations: () => void;
  recommendationConfidenceThreshold: number;
  onChangeRecommendationConfidenceThreshold: (threshold: number) => void;
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
  const activeLaneEqCount = beat
    ? DRUM_LANES.filter((lane) => {
        const eq = beat.laneEqSettings[lane];
        return Boolean(eq.hpHz || eq.lpHz);
      }).length
    : 0;
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

      {laneEqRecommendations.length > 0 && (
        <div className="mt-3 rounded-lg border border-cyan-400/20 bg-cyan-500/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-100/80">
              Auto lane EQ recommendations
            </p>
            <button
              type="button"
              onClick={onApplyAllLaneEqRecommendations}
              className="rounded-lg border border-cyan-300/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-100 hover:bg-cyan-400/10"
            >
              Apply all actionable
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-black/25 p-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-white/60">Confidence</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={recommendationConfidenceThreshold}
              onChange={(e) => onChangeRecommendationConfidenceThreshold(Number(e.currentTarget.value))}
              className="h-1.5 w-16 appearance-none rounded-full bg-white/20 accent-cyan-400"
              title="Higher values filter out lower-confidence recommendations"
            />
            <span className="text-[9px] font-bold text-cyan-100/70">{(recommendationConfidenceThreshold * 100).toFixed(0)}%</span>
          </div>
          <div className="mt-2 grid gap-1.5 md:grid-cols-2">
            {laneEqRecommendations.slice(0, 6).map((rec, idx) => (
              <button
                key={`${rec.lane}-${rec.type}-${idx}`}
                type="button"
                onClick={() => onApplyLaneEqRecommendation(rec)}
                className="rounded-md border border-white/15 bg-black/20 px-2 py-1.5 text-left hover:bg-white/5"
                title={rec.reason}
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">
                  {rec.lane.toUpperCase()} · {rec.type.toUpperCase()} · {Math.round(rec.valueHz)} Hz
                </p>
                <p className="mt-1 text-[11px] text-white/80">{rec.reason}</p>
              </button>
            ))}
          </div>
        </div>
      )}

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
        <button
          type="button"
          onClick={onApplyKick808Split}
          className="rounded-lg border border-emerald-300/35 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-emerald-100 hover:bg-emerald-400/10"
        >
          Kick/808 split
        </button>
        <button
          type="button"
          onClick={onApplyPercussionLowCut}
          className="rounded-lg border border-indigo-300/35 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-indigo-100 hover:bg-indigo-400/10"
        >
          Perc low-cut
        </button>
        <button
          type="button"
          onClick={onClearBeatEqTemplates}
          className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white/80 hover:bg-white/10"
        >
          Clear lane EQ
        </button>
        <p className="text-xs text-white/55">
          Mono checks: {lowEndWideCount} low-end lane{lowEndWideCount === 1 ? "" : "s"} wide · {stereoFxHeavyCount} stereo-heavy FX lane{stereoFxHeavyCount === 1 ? "" : "s"} · phase {phaseCorrelation.toFixed(2)} · lane EQ templates {activeLaneEqCount}.
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

function CommentPinsStripImpl({
  comments,
  positionSec,
  durationSec,
  onSeek,
  collaborators,
  selfId,
}: {
  comments: StudioComment[];
  positionSec: number;
  durationSec: number;
  onSeek: (sec: number) => void;
  collaborators: CollaboratorPresence[];
  selfId: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const safeDuration = Math.max(0.25, durationSec);
  const pinned = comments.filter((c) => c.timelineSec !== null);

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / Math.max(1, rect.width)));
    onSeek(ratio * safeDuration);
  };

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((r) => ({
    ratio: r,
    label: fmtTime(r * safeDuration),
  }));

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
      <div className="mb-1 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.2em] text-white/45">
        <span>Timeline · comments</span>
        <span className="font-mono normal-case tracking-normal text-cyan-200/80">
          {fmtTime(positionSec)} / {fmtTime(safeDuration)}
        </span>
      </div>
      <div
        ref={ref}
        onClick={handleClick}
        className="relative h-8 cursor-pointer rounded-md border border-white/10 bg-gradient-to-b from-white/[0.04] to-black/40"
        title="Click to seek"
      >
        {ticks.map((t) => (
          <div
            key={t.ratio}
            className="absolute top-0 bottom-0 w-px bg-white/10"
            style={{ left: `${t.ratio * 100}%` }}
          />
        ))}
        <div
          className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-cyan-300/90"
          style={{ left: `${Math.max(0, Math.min(1, positionSec / safeDuration)) * 100}%` }}
          aria-label="Playhead"
        />
        {pinned.map((c) => {
          const ratio = Math.max(0, Math.min(1, (c.timelineSec ?? 0) / safeDuration));
          return (
            <button
              key={c.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSeek(c.timelineSec ?? 0);
              }}
              title={`${c.authorName}: ${c.message.slice(0, 80)}${c.message.length > 80 ? "…" : ""} · ${fmtTime(c.timelineSec ?? 0)}`}
              aria-label={`Comment by ${c.authorName} at ${fmtTime(c.timelineSec ?? 0)}`}
              className="absolute -translate-x-1/2 transform"
              style={{ left: `${ratio * 100}%`, top: "50%", marginTop: "-6px" }}
            >
              <span className="block h-3 w-3 rounded-full border border-amber-200 bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.55)] transition-transform hover:scale-125" />
            </button>
          );
        })}
        {/* Live collaborator cursors. Each peer's playhead position
            renders as a thin colored line so everyone can see where
            their bandmates are listening from. */}
        {collaborators
          .filter((c) => c.id !== selfId && typeof c.playheadSec === "number")
          .map((c) => {
            const sec = c.playheadSec as number;
            const ratio = Math.max(0, Math.min(1, sec / safeDuration));
            const hue = c.hue ?? 200;
            return (
              <div
                key={c.id}
                className="pointer-events-none absolute -translate-x-1/2 transform"
                style={{ left: `${ratio * 100}%`, top: 0, bottom: 0 }}
                title={`${c.name} @ ${fmtTime(sec)}`}
              >
                <div
                  className="h-full w-0.5"
                  style={{ background: `hsl(${hue}, 80%, 70%)` }}
                />
                <span
                  className="absolute -top-2 left-1/2 -translate-x-1/2 transform whitespace-nowrap rounded px-1 py-[1px] text-[9px] font-bold uppercase tracking-widest text-white"
                  style={{
                    background: `hsla(${hue}, 80%, 50%, 0.85)`,
                  }}
                >
                  {c.name.slice(0, 12)}
                </span>
              </div>
            );
          })}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[9px] text-white/35">
        {ticks.map((t) => (
          <span key={t.ratio}>{t.label}</span>
        ))}
      </div>
    </div>
  );
}

function SyncBadge({
  isOnline,
  isAutosaving,
  autosaveError,
  lastAutosaveAt,
  autosaveOn,
}: {
  isOnline: boolean;
  isAutosaving: boolean;
  autosaveError: boolean;
  lastAutosaveAt: number | null;
  autosaveOn: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, []);

  if (!autosaveOn) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/55">
        <div className="flex items-center gap-2 font-black uppercase tracking-widest">
          <span className="h-2 w-2 rounded-full bg-white/30" />
          Autosave off
        </div>
      </div>
    );
  }

  let tone: "saved" | "saving" | "offline" | "error" | "pending";
  if (isAutosaving) tone = "saving";
  else if (!isOnline) tone = "offline";
  else if (autosaveError) tone = "error";
  else if (lastAutosaveAt === null) tone = "pending";
  else tone = "saved";

  const palette = {
    saved: { border: "border-emerald-400/30", bg: "bg-emerald-400/10", text: "text-emerald-100", dot: "bg-emerald-300" },
    saving: { border: "border-cyan-400/30", bg: "bg-cyan-400/10", text: "text-cyan-100", dot: "bg-cyan-300 animate-pulse" },
    offline: { border: "border-yellow-400/30", bg: "bg-yellow-400/10", text: "text-yellow-100", dot: "bg-yellow-300" },
    error: { border: "border-red-400/30", bg: "bg-red-400/10", text: "text-red-100", dot: "bg-red-300" },
    pending: { border: "border-white/10", bg: "bg-black/25", text: "text-white/55", dot: "bg-white/30" },
  }[tone];

  let label: string;
  let detail: string | null = null;
  if (tone === "saving") label = "Saving…";
  else if (tone === "offline") {
    label = "Offline";
    detail = "Changes will sync when you reconnect.";
  } else if (tone === "error") {
    label = "Save failed";
    detail = "We'll retry on the next autosave tick.";
  } else if (tone === "pending") label = "Not saved yet";
  else {
    const seconds = lastAutosaveAt ? Math.max(0, Math.round((now - lastAutosaveAt) / 1000)) : 0;
    if (seconds < 5) label = "Saved just now";
    else if (seconds < 60) label = `Saved ${seconds}s ago`;
    else if (seconds < 3600) label = `Saved ${Math.round(seconds / 60)}m ago`;
    else label = `Saved ${Math.round(seconds / 3600)}h ago`;
  }

  return (
    <div
      className={`rounded-xl border px-3 py-2 text-xs ${palette.border} ${palette.bg} ${palette.text}`}
      title={lastAutosaveAt ? `Last autosave: ${new Date(lastAutosaveAt).toLocaleTimeString()}` : "No autosave yet"}
    >
      <div className="flex items-center gap-2 font-black uppercase tracking-widest">
        <span className={`h-2 w-2 rounded-full ${palette.dot}`} />
        {label}
      </div>
      {detail && (
        <p className="mt-1 max-w-[16rem] text-[11px] leading-relaxed opacity-75">{detail}</p>
      )}
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
      <p className="flex-1">{notice.message}</p>
      {notice.action ? (
        <button
          type="button"
          onClick={() => {
            notice.action?.onAction();
            onDismiss();
          }}
          className="rounded-md border border-white/20 bg-black/30 px-3 py-1 text-xs font-bold uppercase tracking-wider transition hover:bg-white/10"
        >
          {notice.action.label}
        </button>
      ) : null}
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
  selfId,
  sessionId,
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
  onSeekToComment,
}: {
  selfId: string;
  sessionId: string | null;
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
  onSeekToComment: (positionSec: number) => void;
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
        <CollaboratorInvitePanel
          selfId={selfId}
          sessionId={sessionId}
          collaborators={collaborators as CollaboratorPresenceRecord[]}
          connected={connected}
        />

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
                  {comment.timelineSec !== null && (
                    <>
                      {" · "}
                      <button
                        type="button"
                        onClick={() => onSeekToComment(comment.timelineSec ?? 0)}
                        className="rounded px-1 font-mono text-cyan-300 underline-offset-2 hover:underline focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
                        title="Jump playhead to this moment"
                      >
                        {fmtTime(comment.timelineSec)}
                      </button>
                    </>
                  )}
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
  lufs,
  truePeak,
  onChange,
}: {
  db: number;
  level: number;
  lufs: number;
  truePeak: number;
  onChange: (db: number) => void;
}) {
  const truePeakDbtp = truePeak > 0 ? 20 * Math.log10(truePeak) : -Infinity;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5">
      <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Master</span>
      <Meter level={level} className="h-1.5 w-16" />
      <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/70" title="Integrated loudness estimate">
        {Number.isFinite(lufs) ? `${lufs.toFixed(1)} LUFS` : "-inf LUFS"}
      </span>
      <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/70" title="True peak level">
        {Number.isFinite(truePeakDbtp) ? `${truePeakDbtp.toFixed(1)} dBTP` : "-inf dBTP"}
      </span>
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
  focusedByCollaborators,
  peaks,
  positionSec,
  detectedChords,
  midiClip,
  positionBeats,
  sidechainOptions,
  onFocus,
  onArm,
  onMute,
  onSolo,
  onToggleFreeze,
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
  onConvertToMidi,
  onSeek,
  onInputGain,
  onSelectCompLane,
  onSetCompSegment,
  vcaGroups,
  soloMode,
  onSetTrackGroup,
  onSetAutomationPoint,
  onClearAutomation,
  isRecording,
  compact,
}: {
  track: EngineSnapshot["tracks"][number];
  focused: boolean;
  /** Other collaborators currently focused on this track. Drawn as
   *  small colored dots in the track header so the user sees who's
   *  looking at what without leaving the workspace. */
  focusedByCollaborators: Array<{ id: string; name: string; hue: number }>;
  /** Pre-computed waveform peaks. Empty array = no audio yet. */
  peaks: number[];
  /** Live transport position so the waveform progress overlay updates. */
  positionSec: number;
  /** Detected chord progression (e.g. ["C", "G", "Am", "F"]). Null when
   *  detection hasn't run yet for this track. */
  detectedChords: string[] | null;
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
  onToggleFreeze: () => void;
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
  onConvertToMidi: (() => void) | null;
  /** Click/drag the waveform to scrub. Receives target position in
   *  seconds. */
  onSeek: (positionSec: number) => void;
  /** Per-track input trim, in dB. Range -24..+12. */
  onInputGain: (db: number) => void;
  onSelectCompLane: (laneId: string) => void;
  onSetCompSegment: (segmentIndex: number, laneId: string) => void;
  vcaGroups: Array<{ id: string; name: string; gainDb: number }>;
  soloMode: "sip" | "afl";
  onSetTrackGroup: (groupId: string | null) => void;
  onSetAutomationPoint: (lane: "gainDb" | "pan", timeSec: number, value: number) => void;
  onClearAutomation: (lane?: "gainDb" | "pan") => void;
  /** True when the transport is currently recording. Combined with
   *  track.armed to draw the red ring on the track being captured. */
  isRecording: boolean;
  compact: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const [compBrushLaneId, setCompBrushLaneId] = useState<string | null>(null);
  const [compSweeping, setCompSweeping] = useState(false);

  useEffect(() => {
    if (!compBrushLaneId && track.compLanes.length > 0) {
      const selected = track.compLanes.find((lane) => lane.selected)?.id ?? track.compLanes[0]?.id ?? null;
      setCompBrushLaneId(selected);
    }
    if (compBrushLaneId && !track.compLanes.some((lane) => lane.id === compBrushLaneId)) {
      const selected = track.compLanes.find((lane) => lane.selected)?.id ?? track.compLanes[0]?.id ?? null;
      setCompBrushLaneId(selected);
    }
  }, [track.compLanes, compBrushLaneId]);

  useEffect(() => {
    if (!compSweeping) return;
    const stopSweep = () => setCompSweeping(false);
    window.addEventListener("mouseup", stopSweep);
    return () => window.removeEventListener("mouseup", stopSweep);
  }, [compSweeping]);

  const progress = track.durationSec > 0 ? positionSec / track.durationSec : 0;

  // Stencilled label on the rack chassis. We always render the rack frame,
  // even on empty tracks, because the rack-unit aesthetic is what makes the
  // workspace read as a studio rather than a web form.
  const rackLabel = track.name.toUpperCase();
  const rackLed: "rec" | "amber" | "green" | null =
    isRecording && track.armed ? "rec" : track.armed ? "amber" : focused ? "green" : null;

  return (
    <RackPanel label={rackLabel} unit={focused ? "FOCUSED" : undefined} led={rackLed}>
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
      className={`relative rounded-lg border transition ${compact ? "p-2.5" : "p-3"} ${
        isRecording && track.armed
          ? "border-red-500/70 bg-red-500/[0.06] shadow-[0_0_0_1px_rgba(239,68,68,0.45),0_0_24px_rgba(239,68,68,0.25)]"
          : dragging
            ? "border-brand-400 bg-brand-500/10"
            : focused
              ? "border-white/25 bg-gradient-to-r from-white/[0.07] to-cyan-400/[0.04]"
              : "border-white/5 bg-gradient-to-r from-white/[0.02] to-transparent"
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
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={track.name}
                onChange={(e) => onRename(e.target.value)}
                maxLength={24}
                className="w-full bg-transparent text-sm font-bold text-white/95 outline-none focus:bg-white/[0.06] rounded px-1 -mx-1"
                aria-label="Track name"
              />
              <StudioTooltip label={tooltips.trackImport}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const input = e.currentTarget
                      .nextElementSibling as HTMLInputElement | null;
                    input?.click();
                  }}
                  className="shrink-0 rounded-md border border-white/10 px-1.5 py-0.5 text-[11px] font-bold text-white/55 transition hover:border-tube-300/45 hover:bg-tube-300/10 hover:text-tube-200"
                  aria-label={`Replace audio in ${track.name}`}
                >
                  ⤒
                </button>
              </StudioTooltip>
              <input
                type="file"
                accept="audio/*,.wav,.mp3,.m4a,.aif,.aiff,.flac,.ogg"
                aria-label={`Replace audio in ${track.name}`}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onImportFile(file);
                  e.currentTarget.value = "";
                }}
              />
              <StudioTooltip label={`Ask the Studio Coach about "${track.name}".`}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (typeof window !== "undefined") {
                      window.dispatchEvent(
                        new CustomEvent("studio:open-coach", {
                          detail: { prefill: `Help me mix the "${track.name}" track.` },
                        }),
                      );
                    }
                  }}
                  className="shrink-0 rounded-md border border-white/10 px-1.5 py-0.5 text-[11px] font-bold text-white/55 transition hover:border-tube-300/45 hover:bg-tube-300/10 hover:text-tube-200"
                  aria-label={`Coach me on ${track.name}`}
                >
                  ✨
                </button>
              </StudioTooltip>
              {track.hasAudio ? (
                <StudioTooltip label="Soft pitch-correct this take to a major scale. Subtle by design.">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (typeof window !== "undefined") {
                        window.dispatchEvent(
                          new CustomEvent("studio:tune-track", {
                            detail: { trackId: track.id },
                          }),
                        );
                      }
                    }}
                    className="shrink-0 rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white/55 transition hover:border-cyan-300/45 hover:bg-cyan-300/10 hover:text-cyan-200"
                    aria-label={`Apply pitch correction to ${track.name}`}
                  >
                    ♪
                  </button>
                </StudioTooltip>
              ) : null}
            </div>
            <p className="text-[10px] text-white/40">
              {track.hasAudio ? `${track.durationSec.toFixed(1)}s recorded` : "Empty"}
              {focused && " · focused"}
            </p>
            {focusedByCollaborators.length > 0 && (
              <div
                className="mt-1 flex flex-wrap items-center gap-1"
                title="Collaborators currently looking at this track"
              >
                {focusedByCollaborators.slice(0, 4).map((c) => (
                  <span
                    key={c.id}
                    className="rounded-full px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-widest text-white"
                    style={{ background: `hsla(${c.hue}, 80%, 50%, 0.85)` }}
                    title={c.name}
                  >
                    {c.name.slice(0, 8)}
                  </span>
                ))}
                {focusedByCollaborators.length > 4 && (
                  <span className="text-[9px] text-white/45">
                    +{focusedByCollaborators.length - 4}
                  </span>
                )}
              </div>
            )}
            {detectedChords && detectedChords.length > 0 && (
              <div
                className="mt-1 flex flex-wrap items-center gap-1"
                title="Detected chord progression — heuristic, treat as a hint not ground truth"
              >
                <span className="text-[9px] font-bold uppercase tracking-widest text-cyan-300/70">
                  Chords
                </span>
                {detectedChords.slice(0, 8).map((label, idx) => (
                  <span
                    key={`${idx}-${label}`}
                    className={`rounded px-1.5 py-[1px] font-mono text-[10px] ${
                      label === "?"
                        ? "border border-white/10 text-white/30"
                        : "border border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
                    }`}
                  >
                    {label}
                  </span>
                ))}
                {detectedChords.length > 8 && (
                  <span className="text-[9px] text-white/35">+{detectedChords.length - 8}</span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
        <StudioTooltip label={tooltips.trackArm}>
        <button
          type="button"
          onClick={() => onArm(!track.armed)}
          className={`min-h-9 min-w-9 rounded-md px-2.5 py-1.5 text-[11px] font-black uppercase tracking-widest transition ${
            track.armed
              ? "bg-red-500 text-white"
              : "border border-red-500/40 text-red-300 hover:bg-red-500/10"
          }`}
        >
          ●
        </button>
        </StudioTooltip>

        <ToggleSwitch
          checked={track.muted}
          onChange={onMute}
          label="Mute"
          labelOn="MUTE"
          labelOff="OPEN"
          tone="amber"
        />

        <ToggleSwitch
          checked={track.solo}
          onChange={onSolo}
          label="Solo"
          labelOn="SOLO"
          labelOff="OFF"
          tone="amber"
        />

        <StudioTooltip
          label={
            track.frozen
              ? "Unfreeze: restore the live FX chain."
              : track.hasAudio
                ? tooltips.trackFreeze
                : "Record or import audio first to freeze."
          }
        >
        <button
          type="button"
          onClick={onToggleFreeze}
          disabled={!track.hasAudio}
          className={`min-h-9 min-w-9 rounded-md px-2.5 py-1.5 text-[11px] font-black uppercase tracking-widest transition disabled:opacity-30 disabled:cursor-not-allowed ${
            track.frozen
              ? "bg-cyan-300 text-black"
              : "border border-cyan-400/40 text-cyan-200 hover:bg-cyan-400/10"
          }`}
        >
          {track.frozen ? "❄" : "F"}
        </button>
        </StudioTooltip>

          {track.solo && (
            <span className="rounded border border-yellow-300/40 bg-yellow-300/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-yellow-100">
              {soloMode}
            </span>
          )}

          <VUMeter
            value={Math.max(0, Math.min(1, track.level))}
            label="LEVEL"
            size="sm"
          />
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
            {onConvertToMidi && (
              <button
                type="button"
                onClick={onConvertToMidi}
                title="Convert this audio to MIDI (sung pitches → piano roll)"
                className="min-h-9 rounded-md px-2.5 py-1.5 text-[11px] font-bold border border-violet-400/40 text-violet-200 hover:bg-violet-400/10 transition"
              >
                → MIDI
              </button>
            )}
          </div>
        )}

        <div className={`flex flex-wrap items-end justify-start gap-5 sm:justify-around`}>
          <Knob
            value={track.inputGainDb ?? -6}
            onChange={onInputGain}
            min={-24}
            max={12}
            step={0.5}
            label="INPUT"
            tone="amber"
            format={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)} dB`}
          />
          <Knob
            value={track.pan}
            onChange={onPan}
            min={-1}
            max={1}
            step={0.05}
            label="PAN"
            tone="cyan"
            format={(v) => {
              if (Math.abs(v) < 0.02) return "C";
              return v < 0 ? `L${Math.round(Math.abs(v) * 100)}` : `R${Math.round(v * 100)}`;
            }}
          />
          <Fader
            value={track.gainDb}
            onChange={onGain}
            min={-60}
            max={6}
            step={0.5}
            label="GAIN"
            height={compact ? 90 : 130}
            format={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)} dB`}
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-3 sm:items-center">
          <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/50">
            VCA
            <select
              value={track.vcaGroupId ?? ""}
              onChange={(e) => onSetTrackGroup(e.target.value || null)}
              className="rounded border border-white/15 bg-black/30 px-1.5 py-1 text-[10px] text-white/80"
              aria-label="Track VCA group"
              title="Track VCA group"
            >
              <option value="">Off</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              {vcaGroups
                .filter((group) => !["A", "B", "C"].includes(group.id))
                .map((group) => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
            </select>
          </label>

          <div className="flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/50">
            <span>Automation</span>
            <button
              type="button"
              onClick={() => onSetAutomationPoint("gainDb", positionSec, track.gainDb)}
              className="rounded border border-white/15 px-1.5 py-0.5 text-[10px] font-semibold text-white/75 hover:bg-white/10"
            >
              Gain @ now
            </button>
            <button
              type="button"
              onClick={() => onSetAutomationPoint("pan", positionSec, track.pan)}
              className="rounded border border-white/15 px-1.5 py-0.5 text-[10px] font-semibold text-white/75 hover:bg-white/10"
            >
              Pan @ now
            </button>
            <button
              type="button"
              onClick={() => onClearAutomation()}
              className="rounded border border-red-400/35 px-1.5 py-0.5 text-[10px] font-semibold text-red-300 hover:bg-red-500/10"
            >
              Clear
            </button>
          </div>

          <div className="text-[10px] text-white/45">
            A-gain {track.automation.gainDb.length} · A-pan {track.automation.pan.length}
          </div>
        </div>

        {(track.inputCalibrating || track.suggestedInputGainDb !== null) && (
          <div className="rounded-md border border-amber-400/25 bg-amber-500/5 px-2.5 py-2 text-[11px] text-amber-50/90">
            {track.inputCalibrating ? (
              <p className="font-semibold">Sampling armed input for 2s to suggest gain trim...</p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">
                  Input peak {(track.inputObservedPeak * 100).toFixed(0)}% · Suggested trim {track.suggestedInputGainDb?.toFixed(1)} dB
                </p>
                {track.suggestedInputGainDb !== null && (
                  <button
                    type="button"
                    onClick={() => onInputGain(track.suggestedInputGainDb ?? track.inputGainDb)}
                    className="rounded border border-amber-300/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-100 hover:bg-amber-300/10"
                  >
                    Apply
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="grid gap-2 lg:grid-cols-2">
          <AutomationLaneEditor
            lane="gainDb"
            points={track.automation.gainDb}
            durationSec={Math.max(track.durationSec, positionSec + 1, 8)}
            currentValue={track.gainDb}
            onSetPoint={(timeSec, value) => onSetAutomationPoint("gainDb", timeSec, value)}
          />
          <AutomationLaneEditor
            lane="pan"
            points={track.automation.pan}
            durationSec={Math.max(track.durationSec, positionSec + 1, 8)}
            currentValue={track.pan}
            onSetPoint={(timeSec, value) => onSetAutomationPoint("pan", timeSec, value)}
          />
        </div>

        {track.compLanes.length > 0 && (
          <div className="rounded-md border border-cyan-400/20 bg-cyan-500/5 px-2.5 py-2 text-[11px] text-cyan-50/90">
            <p className="mb-1 font-semibold">Comp lanes</p>
            <div className="flex flex-wrap gap-1.5">
              {track.compLanes.map((lane) => (
                <button
                  key={lane.id}
                  type="button"
                  onClick={() => onSelectCompLane(lane.id)}
                  className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide transition ${
                    lane.selected
                      ? "border-cyan-200/70 bg-cyan-200/20 text-cyan-50"
                      : "border-cyan-300/25 text-cyan-100/80 hover:bg-cyan-300/10"
                  }`}
                >
                  {lane.name}
                </button>
              ))}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wide text-cyan-100/75">Brush</span>
              {track.compLanes.map((lane) => (
                <button
                  key={`brush_${lane.id}`}
                  type="button"
                  onClick={() => setCompBrushLaneId(lane.id)}
                  className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide transition ${
                    compBrushLaneId === lane.id
                      ? "border-cyan-100/80 bg-cyan-200/25 text-cyan-50"
                      : "border-cyan-300/25 text-cyan-100/75 hover:bg-cyan-300/10"
                  }`}
                >
                  {lane.name}
                </button>
              ))}
            </div>

            {track.compSegmentLaneIds.length > 0 && (
              <div className="mt-2 grid grid-cols-8 gap-1">
                {track.compSegmentLaneIds.map((laneId, index) => {
                  const laneName =
                    track.compLanes.find((lane) => lane.id === laneId)?.name ??
                    track.compLanes.find((lane) => lane.selected)?.name ??
                    "Take";
                  const active = compBrushLaneId === laneId;
                  return (
                    <button
                      key={`seg_${index}`}
                      type="button"
                      onMouseDown={() => {
                        if (!compBrushLaneId) return;
                        setCompSweeping(true);
                        onSetCompSegment(index, compBrushLaneId);
                      }}
                      onMouseEnter={(e) => {
                        if (!compSweeping || !compBrushLaneId || e.buttons !== 1) return;
                        onSetCompSegment(index, compBrushLaneId);
                      }}
                      className={`rounded border px-1 py-1 text-[9px] font-bold uppercase tracking-wide transition ${
                        active
                          ? "border-cyan-100/70 bg-cyan-200/25 text-cyan-50"
                          : "border-cyan-300/30 bg-cyan-500/10 text-cyan-100/80 hover:bg-cyan-300/15"
                      }`}
                      title={`Segment ${index + 1}: ${laneName}`}
                    >
                      {laneName.replace(/^Take\s*/i, "T")}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
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
          eqSpectrum={track.eqSpectrum}
          compGainReductionDb={track.compGainReductionDb}
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
    </RackPanel>
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

function AflBusPanel({ mode, level }: { mode: "sip" | "afl"; level: number }) {
  return (
    <div className="mb-5 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/55">AFL audition bus</p>
        <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${mode === "afl" ? "border-cyan-200/40 bg-cyan-200/15 text-cyan-100" : "border-white/20 text-white/45"}`}>
          {mode}
        </span>
      </div>
      <Meter level={mode === "afl" ? level : 0} className="h-2 w-full" />
      <p className="mt-1 text-[10px] text-white/45">Dedicated meter for post-fader solo audition path.</p>
    </div>
  );
}

function AutomationLaneEditor({
  lane,
  points,
  durationSec,
  currentValue,
  onSetPoint,
}: {
  lane: "gainDb" | "pan";
  points: Array<{ timeSec: number; valueDb: number }> | Array<{ timeSec: number; value: number }>;
  durationSec: number;
  currentValue: number;
  onSetPoint: (timeSec: number, value: number) => void;
}) {
  const width = 280;
  const height = 78;
  const min = lane === "gainDb" ? -60 : -1;
  const max = lane === "gainDb" ? 6 : 1;

  const normalize = (value: number) => {
    const clamped = Math.max(min, Math.min(max, value));
    return (clamped - min) / Math.max(1e-6, max - min);
  };
  const denormalize = (k: number) => {
    const clamped = Math.max(0, Math.min(1, k));
    return min + clamped * (max - min);
  };
  const toX = (timeSec: number) => Math.max(0, Math.min(width, (timeSec / Math.max(0.25, durationSec)) * width));
  const toY = (value: number) => Math.max(0, Math.min(height, height - normalize(value) * height));
  const toTime = (x: number) => Math.max(0, Math.min(durationSec, (x / width) * durationSec));
  const toValue = (y: number) => denormalize(1 - y / height);

  const normalizedPoints = points
    .map((p) => {
      const value = "valueDb" in p ? p.valueDb : p.value;
      return {
        timeSec: p.timeSec,
        value,
        x: toX(p.timeSec),
        y: toY(value),
      };
    })
    .sort((a, b) => a.timeSec - b.timeSec);

  const path =
    normalizedPoints.length === 0
      ? ""
      : normalizedPoints
          .map((p, index) => `${index === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
          .join(" ");

  const handlePointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * width;
    const y = ((event.clientY - rect.top) / Math.max(1, rect.height)) * height;
    onSetPoint(toTime(x), toValue(y));
  };

  return (
    <div className="rounded-md border border-white/12 bg-black/25 p-2">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/55">
          {lane === "gainDb" ? "Gain automation" : "Pan automation"}
        </p>
        <span className="font-mono text-[10px] text-white/55">
          {lane === "gainDb" ? `${currentValue.toFixed(1)} dB` : currentValue.toFixed(2)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-20 w-full cursor-crosshair overflow-hidden rounded border border-white/10 bg-black/35"
        onPointerDown={handlePointer}
        onPointerMove={(event) => {
          if (event.buttons !== 1) return;
          handlePointer(event);
        }}
      >
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
        {path && <path d={path} fill="none" stroke="rgba(34,211,238,0.9)" strokeWidth={2} />}
        {normalizedPoints.map((p) => (
          <circle
            key={`${lane}_${p.timeSec.toFixed(3)}`}
            cx={p.x}
            cy={p.y}
            r={2.5}
            fill="rgba(236,254,255,0.95)"
            stroke="rgba(8,145,178,0.95)"
            strokeWidth={1}
          />
        ))}
      </svg>
      <p className="mt-1 text-[10px] text-white/45">Click to place points. Drag to draw curves over time.</p>
    </div>
  );
}
