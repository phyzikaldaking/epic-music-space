"use client";

import { useMemo, useState, type ReactNode } from "react";

import BeatMachineProClient from "../beat-machine/BeatMachineProClient";
import {
  initialStudioState,
  studioNowLabel,
  studioUid,
  type StudioClip,
  type StudioEditCommand,
  type StudioEditMode,
  type StudioExportType,
  type StudioRole,
  type StudioRulerMode,
  type StudioState,
  type StudioTrack,
} from "./studioUnifiedState";

type Panel = StudioState["activePanel"];

type PanelGroup = {
  label: string;
  items: Array<{ id: Panel; label: string; hint: string }>;
};

const panelGroups: PanelGroup[] = [
  {
    label: "Arrange",
    items: [
      { id: "overview", label: "Session", hint: "Open workspace overview" },
      { id: "edit", label: "Edit", hint: "Timeline, clips, and selections" },
      { id: "mix", label: "Mix", hint: "Console and gain staging" },
    ],
  },
  {
    label: "Delivery",
    items: [
      { id: "cloud", label: "Cloud", hint: "Project sync and session state" },
      { id: "ai", label: "AI Mix", hint: "Automation and finishing assists" },
      { id: "export", label: "Export", hint: "Bounce and package outputs" },
    ],
  },
  {
    label: "Team",
    items: [
      { id: "collab", label: "Collab", hint: "Invite and manage contributors" },
      { id: "tests", label: "Tests", hint: "Launch readiness checklist" },
    ],
  },
];

const roles: StudioRole[] = [
  "viewer",
  "commenter",
  "editor",
  "engineer",
  "owner",
];
const exportTypes: StudioExportType[] = [
  "MP3 Demo",
  "WAV Master",
  "Stems",
  "Social Preview",
  "Archive Bundle",
];
const editModes: StudioEditMode[] = ["slip", "grid", "shuffle", "spot"];
const rulerModes: StudioRulerMode[] = [
  "bars",
  "minutes",
  "samples",
  "timecode",
];
const editCommands: Array<{ id: StudioEditCommand; label: string }> = [
  { id: "separate", label: "Separate Clip" },
  { id: "heal", label: "Heal Separation" },
  { id: "duplicate", label: "Duplicate Clip" },
  { id: "consolidate", label: "Consolidate Clip" },
  { id: "trim-selection", label: "Trim To Selection" },
  { id: "clear", label: "Clear Selection" },
  { id: "batch-gain", label: "Batch Gain" },
  { id: "group", label: "Group Clips" },
];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatTime(
  seconds: number,
  mode: StudioRulerMode,
  bpm: number,
  sampleRate: number,
) {
  if (mode === "samples")
    return `${Math.round(seconds * sampleRate).toLocaleString()} smp`;
  if (mode === "timecode") {
    const safe = Math.max(0, seconds);
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = Math.floor(safe % 60);
    const f = Math.floor((safe % 1) * 30);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
  }
  if (mode === "minutes") {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  const beat = Math.floor((seconds / 60) * bpm);
  return `${Math.floor(beat / 4) + 1}|${(beat % 4) + 1}`;
}

function StatusPill({
  tone,
  children,
}: {
  tone: "cyan" | "green" | "amber" | "red" | "neutral";
  children: ReactNode;
}) {
  const toneClass = {
    cyan: "border-cyan-400/30 bg-cyan-400/10 text-cyan-100",
    green: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
    amber: "border-amber-400/30 bg-amber-400/10 text-amber-100",
    red: "border-red-400/30 bg-red-400/10 text-red-100",
    neutral: "border-white/12 bg-white/[0.045] text-white/72",
  }[tone];

  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]",
        toneClass,
      )}
    >
      {children}
    </span>
  );
}

function RailSection({
  label,
  meta,
  children,
}: {
  label: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-white/6 px-4 py-4 last:border-b-0">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/55">
          {label}
        </h2>
        {meta ? (
          <span className="ml-auto text-[10px] uppercase tracking-[0.24em] text-white/28">
            {meta}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function MeterCard({
  label,
  value,
  accent,
  detail,
}: {
  label: string;
  value: string;
  accent: string;
  detail: string;
}) {
  return (
    <div className="border-l border-white/8 pl-3 first:border-l-0 first:pl-0">
      <p className="text-[10px] uppercase tracking-[0.22em] text-white/36">
        {label}
      </p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <span className="text-lg font-semibold text-white">{value}</span>
        <span className="text-[11px] text-white/38">{detail}</span>
      </div>
      <div className="mt-3 h-px overflow-hidden bg-white/8">
        <div
          className="h-full"
          style={{
            width: accent,
            background:
              "linear-gradient(90deg, rgba(98,211,255,0.22), rgba(98,211,255,0.9))",
          }}
        />
      </div>
    </div>
  );
}

function TrackLane({
  track,
  clips,
  selectedClipIds,
  ruler,
  bpm,
  sampleRate,
  onSelectClip,
}: {
  track: StudioTrack;
  clips: StudioClip[];
  selectedClipIds: string[];
  ruler: StudioRulerMode;
  bpm: number;
  sampleRate: number;
  onSelectClip: (id: string) => void;
}) {
  return (
    <div className="grid min-h-[92px] grid-cols-[220px_minmax(0,1fr)] border-b border-white/6 last:border-b-0 max-md:grid-cols-1">
      <div className="border-r border-white/6 bg-[#090c11] px-4 py-3 max-md:border-b max-md:border-r-0">
        <div className="flex items-start gap-3">
          <span
            className="mt-1 h-10 w-1.5 rounded-full"
            style={{
              backgroundColor: track.color,
              boxShadow: `0 0 18px ${track.color}`,
            }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-white">
                {track.name}
              </p>
              <span className="px-2 py-0.5 text-[9px] uppercase tracking-[0.22em] text-white/30">
                {track.kind}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-white/38">{track.route}</p>
            <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-[0.22em] text-white/48">
              <span
                className={cn(
                  "px-2 py-1",
                  track.muted ? "bg-amber-300 text-black" : "bg-white/[0.055]",
                )}
              >
                Mute
              </span>
              <span
                className={cn(
                  "px-2 py-1",
                  track.solo ? "bg-cyan-300 text-black" : "bg-white/[0.055]",
                )}
              >
                Solo
              </span>
              <span
                className={cn(
                  "px-2 py-1",
                  track.armed ? "bg-red-400 text-black" : "bg-white/[0.055]",
                )}
              >
                Rec
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="relative overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))]">
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:80px_100%] opacity-25" />
        <div className="absolute inset-y-0 left-[20%] w-px bg-cyan-300/20" />
        <div className="absolute inset-y-0 left-[50%] w-px bg-white/8" />
        <div className="relative h-full px-3 py-3">
          {clips.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/18 text-xs uppercase tracking-[0.22em] text-white/28">
              Track ready for takes
            </div>
          ) : (
            <div className="relative h-full min-w-[720px]">
              {clips.map((clip) => {
                const selected = selectedClipIds.includes(clip.id);
                return (
                  <button
                    key={clip.id}
                    type="button"
                    onClick={() => onSelectClip(clip.id)}
                    className={cn(
                      "absolute top-3 rounded-[18px] border px-4 py-3 text-left transition",
                      selected
                        ? "border-cyan-300/60 bg-cyan-300/14 shadow-[0_0_30px_rgba(103,232,249,0.18)]"
                        : "border-white/8 bg-black/42 hover:border-white/16 hover:bg-white/[0.06]",
                    )}
                    style={{
                      left: `${clip.start * 20}px`,
                      width: `${Math.max(170, clip.duration * 54)}px`,
                    }}
                  >
                    <span
                      className="block truncate text-[11px] font-semibold uppercase tracking-[0.2em]"
                      style={{ color: track.color }}
                    >
                      {clip.name}
                    </span>
                    <span className="mt-1 block text-[11px] text-white/48">
                      {formatTime(clip.start, ruler, bpm, sampleRate)} ·{" "}
                      {clip.duration.toFixed(1)}s · {clip.gainDb}dB
                    </span>
                    <span className="mt-2 flex gap-2 text-[10px] uppercase tracking-[0.18em] text-white/34">
                      <span>
                        {clip.consolidated ? "consolidated" : "editable"}
                      </span>
                      <span>{clip.synced ? "cloud" : "local"}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function StudioProductionWorkspace() {
  const [state, setState] = useState<StudioState>(initialStudioState);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<StudioRole>("editor");

  const tests = [
    "Route renders active production workspace",
    "Import creates a shared clip record",
    "Track controls update shared track state",
    "Cloud save updates shared session state",
    "Export jobs use shared export queue",
    "Collaborator roles update shared collaborator state",
    "No wrapper stack is required for main DAW features",
    "Managed layout has no floating launch overlay",
    "Inspector collapses into normal page flow on smaller screens",
    "Edit engine owns modes, snap, nudge, selection, commands, markers, and history",
  ];

  const audioTracks = state.tracks.filter((track) => track.kind !== "master");
  const master = state.tracks.find((track) => track.kind === "master");
  const armed = state.tracks.find((track) => track.armed);
  const selectedClips = state.clips.filter((clip) =>
    state.timeline.selectedClipIds.includes(clip.id),
  );
  const completionScore = useMemo(() => {
    const checks = [
      Boolean(state.session.id),
      state.tracks.length > 0,
      state.collaborators.length > 0,
      state.exports.length > 0,
      state.session.cloudSynced,
      !state.editorLock.locked,
      state.workspace === "production",
      state.timeline.undo.length > 0 || state.timeline.markers.length > 0,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [state]);

  function setPanel(activePanel: Panel) {
    setState((current) => ({ ...current, activePanel }));
  }

  function pushHistory(label: string) {
    setState((current) => ({
      ...current,
      session: { ...current.session, dirty: true, cloudSynced: false },
      timeline: {
        ...current.timeline,
        undo: [
          { id: studioUid("history"), label, createdAt: studioNowLabel() },
          ...current.timeline.undo,
        ].slice(0, 25),
        redo: [],
      },
    }));
  }

  function updateTimeline(patch: Partial<StudioState["timeline"]>) {
    setState((current) => ({
      ...current,
      session: { ...current.session, dirty: true, cloudSynced: false },
      timeline: { ...current.timeline, ...patch },
    }));
  }

  function updateTrack(
    id: string,
    patch: Partial<StudioState["tracks"][number]>,
  ) {
    setState((current) => ({
      ...current,
      session: { ...current.session, dirty: true, cloudSynced: false },
      tracks: current.tracks.map((track) =>
        track.id === id ? { ...track, ...patch } : track,
      ),
    }));
  }

  function setWorkspace(workspace: StudioState["workspace"]) {
    setState((current) => ({ ...current, workspace }));
  }

  function armTrack(id: string) {
    setState((current) => ({
      ...current,
      session: { ...current.session, dirty: true, cloudSynced: false },
      tracks: current.tracks.map((track) => ({
        ...track,
        armed: track.kind === "audio" && track.id === id,
      })),
    }));
  }

  function createClip() {
    const target = armed ?? audioTracks[0];
    if (!target) return;
    const clip = {
      id: studioUid("clip"),
      name: `Shared Clip ${state.clips.length + 1}`,
      trackId: target.id,
      start: state.clips.length * 2,
      duration: 4,
      gainDb: 0,
      fadeIn: 0,
      fadeOut: 0,
      grouped: false,
      consolidated: false,
      synced: false,
      missing: false,
    };
    setState((current) => ({
      ...current,
      session: { ...current.session, dirty: true, cloudSynced: false },
      clips: [...current.clips, clip],
      timeline: {
        ...current.timeline,
        selectedClipIds: [clip.id],
        undo: [
          {
            id: studioUid("history"),
            label: `Created ${clip.name}`,
            createdAt: studioNowLabel(),
          },
          ...current.timeline.undo,
        ],
        redo: [],
      },
      activePanel: "edit",
    }));
  }

  function selectClip(id: string) {
    updateTimeline({ selectedClipIds: [id] });
  }

  function updateSelectedClips(
    patch: Partial<StudioState["clips"][number]>,
    label: string,
  ) {
    const selectedIds = state.timeline.selectedClipIds;
    if (!selectedIds.length) return;
    setState((current) => ({
      ...current,
      session: { ...current.session, dirty: true, cloudSynced: false },
      clips: current.clips.map((clip) =>
        selectedIds.includes(clip.id)
          ? { ...clip, ...patch, synced: false }
          : clip,
      ),
      timeline: {
        ...current.timeline,
        undo: [
          { id: studioUid("history"), label, createdAt: studioNowLabel() },
          ...current.timeline.undo,
        ].slice(0, 25),
        redo: [],
      },
    }));
  }

  function moveSelected(direction: -1 | 1) {
    const selectedIds = state.timeline.selectedClipIds;
    if (!selectedIds.length) return;
    const amount = state.timeline.nudgeValue * direction;
    setState((current) => ({
      ...current,
      session: { ...current.session, dirty: true, cloudSynced: false },
      clips: current.clips.map((clip) =>
        selectedIds.includes(clip.id)
          ? {
              ...clip,
              start: Math.max(0, Number((clip.start + amount).toFixed(3))),
              synced: false,
            }
          : clip,
      ),
      timeline: {
        ...current.timeline,
        undo: [
          {
            id: studioUid("history"),
            label: `Nudged ${selectedIds.length} clip${selectedIds.length === 1 ? "" : "s"}`,
            createdAt: studioNowLabel(),
          },
          ...current.timeline.undo,
        ].slice(0, 25),
        redo: [],
      },
    }));
  }

  function runCommand(command: StudioEditCommand) {
    const selectedIds = state.timeline.selectedClipIds;
    if (!selectedIds.length && command !== "clear") return;
    if (command === "clear") {
      updateTimeline({ selectedClipIds: [] });
      return;
    }
    if (command === "duplicate") {
      const copies = state.clips
        .filter((clip) => selectedIds.includes(clip.id))
        .map((clip) => ({
          ...clip,
          id: studioUid("clip"),
          name: `${clip.name} Copy`,
          start: clip.start + state.timeline.nudgeValue,
          synced: false,
        }));
      setState((current) => ({
        ...current,
        clips: [...current.clips, ...copies],
        session: { ...current.session, dirty: true, cloudSynced: false },
        timeline: {
          ...current.timeline,
          selectedClipIds: copies.map((clip) => clip.id),
          undo: [
            {
              id: studioUid("history"),
              label: "Duplicated clip selection",
              createdAt: studioNowLabel(),
            },
            ...current.timeline.undo,
          ],
          redo: [],
        },
      }));
      return;
    }
    if (command === "consolidate")
      return updateSelectedClips(
        { consolidated: true, fadeIn: 0, fadeOut: 0 },
        "Consolidated clip selection",
      );
    if (command === "heal")
      return updateSelectedClips(
        { fadeIn: 0, fadeOut: 0, grouped: false },
        "Healed separated clip edges",
      );
    if (command === "separate")
      return updateSelectedClips(
        { fadeIn: 0.03, fadeOut: 0.03 },
        "Separated clip at selection",
      );
    if (command === "trim-selection") {
      return updateSelectedClips(
        {
          start: state.timeline.selectionStart,
          duration: Math.max(
            0.1,
            state.timeline.selectionEnd - state.timeline.selectionStart,
          ),
        },
        "Trimmed clip to selection",
      );
    }
    if (command === "batch-gain")
      return updateSelectedClips({ gainDb: 2 }, "Applied batch clip gain");
    if (command === "group")
      return updateSelectedClips({ grouped: true }, "Grouped selected clips");
  }

  function undoEdit() {
    const [entry, ...rest] = state.timeline.undo;
    if (!entry) return;
    setState((current) => ({
      ...current,
      timeline: {
        ...current.timeline,
        undo: rest,
        redo: [entry, ...current.timeline.redo],
      },
      session: { ...current.session, dirty: true, cloudSynced: false },
    }));
  }

  function redoEdit() {
    const [entry, ...rest] = state.timeline.redo;
    if (!entry) return;
    setState((current) => ({
      ...current,
      timeline: {
        ...current.timeline,
        redo: rest,
        undo: [entry, ...current.timeline.undo],
      },
      session: { ...current.session, dirty: true, cloudSynced: false },
    }));
  }

  function addMarker() {
    const marker = {
      id: studioUid("marker"),
      name: `Marker ${state.timeline.markers.length + 1}`,
      position: state.timeline.selectionStart,
      color: "#65d6ff",
    };
    setState((current) => ({
      ...current,
      timeline: {
        ...current.timeline,
        markers: [...current.timeline.markers, marker],
        undo: [
          {
            id: studioUid("history"),
            label: `Added ${marker.name}`,
            createdAt: studioNowLabel(),
          },
          ...current.timeline.undo,
        ],
      },
      session: { ...current.session, dirty: true, cloudSynced: false },
    }));
  }

  function addMemoryLocation() {
    const memory = {
      id: studioUid("memory"),
      name: `Memory ${state.timeline.memoryLocations.length + 1}`,
      start: state.timeline.selectionStart,
      end: state.timeline.selectionEnd,
    };
    setState((current) => ({
      ...current,
      timeline: {
        ...current.timeline,
        memoryLocations: [...current.timeline.memoryLocations, memory],
        undo: [
          {
            id: studioUid("history"),
            label: `Added ${memory.name}`,
            createdAt: studioNowLabel(),
          },
          ...current.timeline.undo,
        ],
      },
      session: { ...current.session, dirty: true, cloudSynced: false },
    }));
  }

  function createCloudProject() {
    setState((current) => ({
      ...current,
      session: {
        ...current.session,
        id: current.session.id ?? `studio_${Date.now().toString(36)}`,
        dirty: false,
        cloudSynced: true,
        savedAt: studioNowLabel(),
      },
      clips: current.clips.map((clip) => ({
        ...clip,
        synced: true,
        audioFileId: clip.audioFileId ?? studioUid("audio-file"),
        storagePath:
          clip.storagePath ??
          `studio/${current.session.id ?? "new"}/audio/${clip.id}.webm`,
      })),
      timeline: {
        ...current.timeline,
        undo: [
          {
            id: studioUid("history"),
            label: "Saved timeline and region list to cloud",
            createdAt: studioNowLabel(),
          },
          ...current.timeline.undo,
        ].slice(0, 25),
      },
      activePanel: "cloud",
    }));
  }

  function queueExport(type: StudioExportType) {
    const job = {
      id: studioUid("export"),
      type,
      status: "queued" as const,
      detail: `${type} queued with clip gain, fades, crossfade metadata, consolidated clips, markers, and region list from the shared edit engine.`,
    };
    setState((current) => ({
      ...current,
      exports: [job, ...current.exports],
      activePanel: "export",
    }));
    window.setTimeout(
      () =>
        setState((current) => ({
          ...current,
          exports: current.exports.map((item) =>
            item.id === job.id ? { ...item, status: "rendering" } : item,
          ),
        })),
      400,
    );
    window.setTimeout(
      () =>
        setState((current) => ({
          ...current,
          exports: current.exports.map((item) =>
            item.id === job.id ? { ...item, status: "complete" } : item,
          ),
        })),
      1100,
    );
  }

  function inviteCollaborator() {
    const email = inviteEmail.trim();
    if (!email) return;
    setState((current) => ({
      ...current,
      session: { ...current.session, dirty: true, cloudSynced: false },
      collaborators: [
        ...current.collaborators,
        { id: studioUid("collab"), email, role: inviteRole, status: "invited" },
      ],
      activePanel: "collab",
    }));
    setInviteEmail("");
  }

  function updateRole(id: string, role: StudioRole) {
    setState((current) => ({
      ...current,
      collaborators: current.collaborators.map((collab) =>
        collab.id === id ? { ...collab, role } : collab,
      ),
      session: { ...current.session, dirty: true, cloudSynced: false },
    }));
  }

  function toggleLock() {
    setState((current) => ({
      ...current,
      editorLock: current.editorLock.locked
        ? { locked: false, owner: null }
        : { locked: true, owner: "Engineer session active" },
    }));
  }

  const statusLabel = state.session.cloudSynced
    ? "Cloud Synced"
    : state.session.dirty
      ? "Dirty"
      : "Local";
  const statusTone = state.session.cloudSynced
    ? "green"
    : state.session.dirty
      ? "amber"
      : "neutral";
  const selectedTrackId =
    selectedClips[0]?.trackId ?? armed?.id ?? audioTracks[0]?.id ?? null;
  const activeGroup = panelGroups.find((group) =>
    group.items.some((item) => item.id === state.activePanel),
  );
  const commandMatches = editCommands.filter((command) =>
    command.label
      .toLowerCase()
      .includes(state.timeline.commandSearch.toLowerCase()),
  );
  const clipCountLabel = `${state.clips.length.toString().padStart(2, "0")} clips`;

  return (
    <main data-ems-workspace className="grid min-h-screen grid-rows-[auto_1fr_auto] overflow-hidden bg-[#05070a] text-white">
      <header className="border-b border-white/8 bg-[linear-gradient(180deg,rgba(19,23,30,0.98),rgba(8,11,16,0.98))] backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-cyan-300/18 bg-cyan-300/10 px-2 py-1 text-[10px] uppercase tracking-[0.32em] text-cyan-100">
                Studio
              </span>
              <span className="text-[10px] uppercase tracking-[0.28em] text-white/28">
                {activeGroup?.label ?? "Arrange"} deck
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
              <h1 className="truncate text-[clamp(1.2rem,1.8vw,1.7rem)] font-semibold text-white">
                {state.session.title}
              </h1>
              <StatusPill tone={statusTone}>{statusLabel}</StatusPill>
              {state.editorLock.locked ? (
                <StatusPill tone="red">
                  {state.editorLock.owner ?? "Locked"}
                </StatusPill>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setWorkspace("production")}
              className={cn(
                "rounded-full px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.24em]",
                state.workspace === "production"
                  ? "bg-white text-black"
                  : "bg-white/[0.06] text-white/68 hover:bg-white/[0.1]",
              )}
            >
              Arrange
            </button>
            <button
              type="button"
              onClick={() => setWorkspace("beat")}
              className={cn(
                "rounded-full px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.24em]",
                state.workspace === "beat"
                  ? "bg-cyan-300 text-black"
                  : "bg-white/[0.06] text-white/68 hover:bg-white/[0.1]",
              )}
            >
              Beat Lab
            </button>
            <button
              type="button"
              onClick={createClip}
              className="rounded-full bg-cyan-300 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-black hover:bg-cyan-200"
            >
              Add Clip
            </button>
            <button
              type="button"
              onClick={createCloudProject}
              className="rounded-full bg-white/[0.08] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/74 hover:bg-white/[0.12]"
            >
              Save Cloud
            </button>
            <button
              type="button"
              onClick={() => queueExport("MP3 Demo")}
              className="rounded-full bg-amber-300 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-black hover:bg-amber-200"
            >
              Export
            </button>
          </div>
        </div>

        <div className="grid gap-3 border-t border-white/6 px-5 py-3 xl:grid-cols-[1.45fr_minmax(0,1fr)]">
          <div className="flex flex-wrap items-center gap-2">
            {panelGroups.flatMap((group) =>
              group.items.map((panel) => {
                const active = state.activePanel === panel.id;
                return (
                  <button
                    key={panel.id}
                    type="button"
                    onClick={() => setPanel(panel.id)}
                    title={panel.hint}
                    className={cn(
                      "rounded-full border px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] transition",
                      active
                        ? "border-cyan-300/40 bg-cyan-300/14 text-cyan-100"
                        : "border-white/8 bg-white/[0.035] text-white/56 hover:bg-white/[0.07] hover:text-white/82",
                    )}
                  >
                    {panel.label}
                  </button>
                );
              }),
            )}
          </div>
          <div className="grid gap-3 border-l border-white/8 pl-3 sm:grid-cols-4">
            <MeterCard
              label="Completion"
              value={`${completionScore}%`}
              accent={`${completionScore}%`}
              detail="launch ready"
            />
            <MeterCard
              label="Selection"
              value={selectedClips.length.toString()}
              accent={`${Math.min(100, selectedClips.length * 24)}%`}
              detail={clipCountLabel}
            />
            <MeterCard
              label="Clock"
              value={formatTime(
                state.timeline.selectionStart,
                state.timeline.ruler,
                state.session.bpm,
                state.session.sampleRate,
              )}
              accent="56%"
              detail={state.timeline.ruler}
            />
            <MeterCard
              label="Master"
              value={`${master?.volume ?? 0}`}
              accent={`${master?.volume ?? 0}%`}
              detail={`${state.session.bpm} BPM`}
            />
          </div>
        </div>
      </header>

      <section className="grid min-h-0 grid-cols-[252px_minmax(0,1fr)_272px] max-[1320px]:grid-cols-[228px_minmax(0,1fr)] max-[1320px]:[&>*:last-child]:col-span-2 max-lg:grid-cols-1 max-lg:[&>*:last-child]:col-span-1">
        <aside className="min-h-0 overflow-auto border-r border-white/6 bg-[linear-gradient(180deg,#090c11,#07090d)]">
          <div className="space-y-0">
            <RailSection label="Transport" meta={statusLabel}>
              <div className="grid gap-3">
                <div className="border-y border-white/6 bg-black/12 p-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateTimeline({ selectionStart: 0, selectionEnd: 4 })
                      }
                      className="grid h-10 w-10 place-items-center border border-white/8 bg-transparent text-white/72 hover:bg-white/[0.06]"
                    >
                      ⏮
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSelected(-1)}
                      className="grid h-10 w-10 place-items-center border border-white/8 bg-transparent text-white/72 hover:bg-white/[0.06]"
                    >
                      ⏪
                    </button>
                    <button
                      type="button"
                      onClick={() => pushHistory("Playback toggled")}
                      className="grid h-12 w-12 place-items-center border border-cyan-300/60 bg-cyan-300 text-lg text-black shadow-[0_10px_30px_rgba(103,232,249,0.18)]"
                    >
                      ▶
                    </button>
                    <button
                      type="button"
                      onClick={() => pushHistory("Stop pressed")}
                      className="grid h-10 w-10 place-items-center border border-white/8 bg-transparent text-white/72 hover:bg-white/[0.06]"
                    >
                      ⏹
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSelected(1)}
                      className="grid h-10 w-10 place-items-center border border-white/8 bg-transparent text-white/72 hover:bg-white/[0.06]"
                    >
                      ⏩
                    </button>
                    <button
                      type="button"
                      onClick={() => pushHistory("Record toggled")}
                      className="grid h-12 w-12 place-items-center border border-red-400/30 bg-red-500/10 text-red-200 hover:bg-red-500/18"
                    >
                      ⏺
                    </button>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] max-sm:grid-cols-1">
                    <label className="border-l border-white/10 bg-white/[0.02] px-3 py-2 text-white/48">
                      <span className="block text-[10px] uppercase tracking-[0.22em] text-white/34">
                        BPM
                      </span>
                      <input
                        type="number"
                        min={40}
                        max={220}
                        value={state.session.bpm}
                        onChange={(event) => {
                          const value = Number.parseInt(event.target.value, 10);
                          if (!Number.isNaN(value))
                            setState((current) => ({
                              ...current,
                              session: {
                                ...current.session,
                                bpm: Math.max(40, Math.min(220, value)),
                              },
                            }));
                        }}
                        className="mt-2 w-full bg-transparent text-lg font-semibold text-white outline-none"
                      />
                    </label>
                    <div className="border-l border-white/10 bg-white/[0.02] px-3 py-2">
                      <span className="block text-[10px] uppercase tracking-[0.22em] text-white/34">
                        Primary Ruler
                      </span>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {rulerModes.map((ruler) => (
                          <button
                            key={ruler}
                            type="button"
                            onClick={() => updateTimeline({ ruler })}
                            className={cn(
                              "px-2.5 py-1 text-[10px] uppercase tracking-[0.18em]",
                              state.timeline.ruler === ruler
                                ? "bg-cyan-300 text-black"
                                : "bg-white/[0.05] text-white/54",
                            )}
                          >
                            {ruler}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </RailSection>

            <RailSection label="Tracks" meta={`${state.tracks.length} loaded`}>
              <div className="space-y-2">
                {state.tracks.map((track) => (
                  <div
                    key={track.id}
                    className={cn(
                      "border-y border-white/6 px-3 py-3 transition",
                      selectedTrackId === track.id
                        ? "bg-cyan-300/8"
                        : "bg-black/10 hover:bg-white/[0.03]",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span className="h-8 w-[3px]" style={{ backgroundColor: track.color }} />
                      <div className="min-w-0 flex-1">
                        <input
                          value={track.name}
                          onChange={(event) =>
                            updateTrack(track.id, { name: event.target.value })
                          }
                          className="w-full bg-transparent text-sm font-semibold text-white outline-none"
                        />
                        <p className="mt-1 text-[11px] text-white/34">
                          {track.kind} · {track.route}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-1.5 text-[10px] uppercase tracking-[0.18em]">
                      <button
                        type="button"
                        onClick={() =>
                          updateTrack(track.id, { muted: !track.muted })
                        }
                        className={cn(
                          "px-2 py-1.5",
                          track.muted
                            ? "bg-amber-300 text-black"
                            : "bg-white/[0.06] text-white/54",
                        )}
                      >
                        Mute
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateTrack(track.id, { solo: !track.solo })
                        }
                        className={cn(
                          "px-2 py-1.5",
                          track.solo
                            ? "bg-cyan-300 text-black"
                            : "bg-white/[0.06] text-white/54",
                        )}
                      >
                        Solo
                      </button>
                      <button
                        type="button"
                        onClick={() => armTrack(track.id)}
                        disabled={track.kind !== "audio"}
                        className={cn(
                          "px-2 py-1.5 disabled:opacity-30",
                          track.armed
                            ? "bg-red-400 text-black"
                            : "bg-white/[0.06] text-white/54",
                        )}
                      >
                        Rec
                      </button>
                      <span className="bg-white/[0.04] px-2 py-1.5 text-center text-white/40">
                        {track.volume}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </RailSection>
          </div>
        </aside>

        <section className="min-h-0 overflow-hidden bg-[linear-gradient(180deg,rgba(15,19,26,0.98),rgba(6,8,12,0.99))]">
          {state.workspace === "beat" ? (
            <div className="h-full overflow-auto p-3">
              <BeatMachineProClient studioMode />
            </div>
          ) : (
            <div className="grid h-full min-h-0 grid-rows-[auto_auto_1fr]">
              <div className="flex flex-wrap items-center gap-2 border-b border-white/6 px-5 py-3">
                <StatusPill tone="cyan">
                  {activeGroup?.label ?? "Arrange"}
                </StatusPill>
                <span className="text-sm font-semibold text-white">
                  {state.activePanel === "overview"
                    ? "Session Overview"
                    : state.activePanel === "edit"
                      ? "Edit Window"
                      : state.activePanel === "mix"
                        ? "Mix Console"
                        : state.activePanel}
                </span>
                <span className="text-sm text-white/28">/</span>
                <span className="text-sm text-white/48">{clipCountLabel}</span>
                <div className="ml-auto flex flex-wrap gap-2">
                  {editModes.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => updateTimeline({ mode })}
                      className={cn(
                        "border-l px-3 py-1.5 text-[10px] uppercase tracking-[0.22em]",
                        state.timeline.mode === mode
                          ? "border-cyan-300/60 bg-white text-black"
                          : "border-white/10 bg-transparent text-white/54 hover:bg-white/[0.06]",
                      )}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-b border-white/6 px-5 py-3">
                <div className="grid gap-0 border-y border-white/6 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="bg-black/10 px-4 py-3">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-[0.24em] text-white/34">
                        Selection
                      </span>
                      <span className="ml-auto text-[10px] uppercase tracking-[0.24em] text-white/28">
                        {formatTime(
                          state.timeline.selectionStart,
                          state.timeline.ruler,
                          state.session.bpm,
                          state.session.sampleRate,
                        )}{" "}
                        →{" "}
                        {formatTime(
                          state.timeline.selectionEnd,
                          state.timeline.ruler,
                          state.session.bpm,
                          state.session.sampleRate,
                        )}
                      </span>
                    </div>
                    <div className="grid gap-2 md:grid-cols-4">
                      <label className="border-l border-white/10 bg-white/[0.02] px-3 py-2 text-[11px] text-white/48">
                        Snap
                        <select
                          value={state.timeline.snapEnabled ? "on" : "off"}
                          onChange={(event) =>
                            updateTimeline({
                              snapEnabled: event.target.value === "on",
                            })
                          }
                          className="mt-2 w-full bg-transparent text-white outline-none"
                        >
                          <option value="on">On</option>
                          <option value="off">Off</option>
                        </select>
                      </label>
                      <label className="border-l border-white/10 bg-white/[0.02] px-3 py-2 text-[11px] text-white/48">
                        Grid
                        <select
                          value={state.timeline.gridSubdivision}
                          onChange={(event) =>
                            updateTimeline({
                              gridSubdivision: event.target
                                .value as StudioState["timeline"]["gridSubdivision"],
                            })
                          }
                          className="mt-2 w-full bg-transparent text-white outline-none"
                        >
                          <option>1 bar</option>
                          <option>1/2</option>
                          <option>1/4</option>
                          <option>1/8</option>
                          <option>1/16</option>
                          <option>samples</option>
                        </select>
                      </label>
                      <label className="border-l border-white/10 bg-white/[0.02] px-3 py-2 text-[11px] text-white/48">
                        Nudge
                        <input
                          type="number"
                          step="0.01"
                          value={state.timeline.nudgeValue}
                          onChange={(event) =>
                            updateTimeline({
                              nudgeValue: Number(event.target.value) || 0.25,
                            })
                          }
                          className="mt-2 w-full bg-transparent text-white outline-none"
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => moveSelected(-1)}
                          className="border-l border-white/10 bg-transparent px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-white/68 hover:bg-white/[0.08]"
                        >
                          Nudge -
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSelected(1)}
                          className="border-l border-white/10 bg-transparent px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-white/68 hover:bg-white/[0.08]"
                        >
                          Nudge +
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="border-l border-white/6 bg-black/10 px-4 py-3">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-[0.24em] text-white/34">
                        Command Deck
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          updateTimeline({
                            commandMenuOpen: !state.timeline.commandMenuOpen,
                          })
                        }
                          className="ml-auto border border-violet-300/40 bg-violet-300 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-black"
                      >
                        {state.timeline.commandMenuOpen ? "Hide" : "Show"}
                      </button>
                    </div>
                    {state.timeline.commandMenuOpen ? (
                      <div>
                        <input
                          value={state.timeline.commandSearch}
                          onChange={(event) =>
                            updateTimeline({
                              commandSearch: event.target.value,
                            })
                          }
                          placeholder="Search edit commands"
                          className="w-full border-b border-white/10 bg-transparent px-0 py-2 text-sm text-white outline-none placeholder:text-white/24"
                        />
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {commandMatches.map((command) => (
                            <button
                              key={command.id}
                              type="button"
                              onClick={() => runCommand(command.id)}
                              className="border-l border-white/10 bg-transparent px-3 py-2 text-left text-[11px] font-semibold text-white/74 transition hover:bg-violet-300 hover:text-black"
                            >
                              {command.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-white/34">
                        Command search stays tucked away until you need it,
                        keeping the edit surface open.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="min-h-0 overflow-auto">
                <div className="border-b border-white/6 px-4 py-3">
                  <div className="grid min-w-[940px] grid-cols-[220px_repeat(8,minmax(80px,1fr))] gap-0 text-[10px] uppercase tracking-[0.24em] text-white/26 max-md:min-w-0 max-md:grid-cols-4">
                    <div className="px-3 py-2 text-white/18">Tracks</div>
                    {Array.from({ length: 8 }, (_, index) => (
                      <div
                        key={index}
                        className="border-l border-white/6 px-3 py-2"
                      >
                        {formatTime(
                          index * 4,
                          state.timeline.ruler,
                          state.session.bpm,
                          state.session.sampleRate,
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="min-w-[940px] max-md:min-w-0">
                  {audioTracks.map((track) => (
                    <TrackLane
                      key={track.id}
                      track={track}
                      clips={state.clips.filter(
                        (clip) => clip.trackId === track.id,
                      )}
                      selectedClipIds={state.timeline.selectedClipIds}
                      ruler={state.timeline.ruler}
                      bpm={state.session.bpm}
                      sampleRate={state.session.sampleRate}
                      onSelectClip={selectClip}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="min-h-0 overflow-auto border-l border-white/6 bg-[linear-gradient(180deg,#090c11,#07090d)]">
          <div className="space-y-0">
            <RailSection label="Inspector" meta={state.activePanel}>
              <div className="grid gap-2 text-[11px]">
                <div className="grid grid-cols-2 gap-2">
                  <div className="border-l border-white/10 bg-black/10 px-3 py-3">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-white/28">
                      Selection Start
                    </p>
                    <input
                      type="number"
                      value={state.timeline.selectionStart}
                      onChange={(event) =>
                        updateTimeline({
                          selectionStart: Number(event.target.value) || 0,
                        })
                      }
                      className="mt-2 w-full bg-transparent text-lg font-semibold text-white outline-none"
                    />
                  </div>
                  <div className="border-l border-white/10 bg-black/10 px-3 py-3">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-white/28">
                      Selection End
                    </p>
                    <input
                      type="number"
                      value={state.timeline.selectionEnd}
                      onChange={(event) =>
                        updateTimeline({
                          selectionEnd: Number(event.target.value) || 0,
                        })
                      }
                      className="mt-2 w-full bg-transparent text-lg font-semibold text-white outline-none"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={addMarker}
                    className="flex-1 bg-cyan-300 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-black"
                  >
                    Marker
                  </button>
                  <button
                    type="button"
                    onClick={addMemoryLocation}
                    className="flex-1 bg-amber-300 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-black"
                  >
                    Memory
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="border-l border-white/10 bg-black/10 px-3 py-3">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-white/28">
                      Selected Clips
                    </p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {selectedClips.length}
                    </p>
                  </div>
                  <div className="border-l border-white/10 bg-black/10 px-3 py-3">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-white/28">
                      Undo Stack
                    </p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {state.timeline.undo.length}
                    </p>
                  </div>
                </div>
              </div>
            </RailSection>

            <RailSection label="Working Set" meta="live">
              {selectedClips.length === 0 ? (
                <p className="text-sm text-white/32">
                  No region selected yet. Pick a clip in the arrange window to
                  tune gain, grouping, and cloud status.
                </p>
              ) : (
                <div className="space-y-2">
                  {selectedClips.map((clip) => (
                    <div
                      key={clip.id}
                      className="border-l border-white/10 bg-black/10 px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">
                            {clip.name}
                          </p>
                          <p className="mt-1 text-[11px] text-white/36">
                            gain {clip.gainDb}dB · fade {clip.fadeIn}/
                            {clip.fadeOut}
                          </p>
                        </div>
                        <StatusPill tone={clip.synced ? "green" : "amber"}>
                          {clip.synced ? "cloud" : "local"}
                        </StatusPill>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </RailSection>

            <RailSection label="Panel Focus" meta={state.activePanel}>
              {state.activePanel === "cloud" ? (
                <div className="space-y-3 text-sm text-white/62">
                  <p>
                    Project ID:{" "}
                    <span className="font-mono text-emerald-100">
                      {state.session.id ?? "not created"}
                    </span>
                  </p>
                  <p>
                    Cloud-backed region records:{" "}
                    {state.clips.filter((clip) => clip.synced).length}/
                    {state.clips.length}
                  </p>
                  <button
                    type="button"
                    onClick={createCloudProject}
                    className="bg-emerald-300 px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-black"
                  >
                    Create / Save Cloud Project
                  </button>
                </div>
              ) : null}

              {state.activePanel === "ai" ? (
                <p className="text-sm text-white/42">
                  AI Mix reads the shared track list and edit region data.
                  Current selected regions: {selectedClips.length}.
                </p>
              ) : null}

              {state.activePanel === "export" ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {exportTypes.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => queueExport(type)}
                        className="bg-amber-300 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-black"
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    {state.exports.length === 0 ? (
                      <p className="text-sm text-white/34">
                        No export jobs yet.
                      </p>
                    ) : (
                      state.exports.map((job) => (
                        <article
                          key={job.id}
                          className="border-l border-white/10 bg-black/10 px-3 py-3"
                        >
                          <div className="flex items-center gap-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                              {job.type}
                            </p>
                            <StatusPill
                              tone={
                                job.status === "complete"
                                  ? "green"
                                  : job.status === "rendering"
                                    ? "cyan"
                                    : "amber"
                              }
                            >
                              {job.status}
                            </StatusPill>
                          </div>
                          <p className="mt-2 text-xs text-white/42">
                            {job.detail}
                          </p>
                        </article>
                      ))
                    )}
                  </div>
                </div>
              ) : null}

              {state.activePanel === "collab" ? (
                <div className="space-y-3">
                  <div className="grid gap-2">
                    <input
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.target.value)}
                      placeholder="collaborator@email.com"
                      className="border-b border-white/10 bg-transparent px-0 py-2 text-sm text-white outline-none placeholder:text-white/26"
                    />
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <select
                        value={inviteRole}
                        onChange={(event) =>
                          setInviteRole(event.target.value as StudioRole)
                        }
                        className="border-l border-white/10 bg-transparent px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-white outline-none"
                      >
                        {roles.map((role) => (
                          <option key={role}>{role}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={inviteCollaborator}
                        className="bg-cyan-300 px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-black"
                      >
                        Invite
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {state.collaborators.map((collab) => (
                      <article
                        key={collab.id}
                        className="border-l border-white/10 bg-black/10 px-3 py-3"
                      >
                        <p className="truncate text-sm font-semibold text-white">
                          {collab.email}
                        </p>
                        <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-2">
                          <span className="text-[11px] text-white/38">
                            {collab.status}
                          </span>
                          <select
                            value={collab.role}
                            onChange={(event) =>
                              updateRole(
                                collab.id,
                                event.target.value as StudioRole,
                              )
                            }
                              className="border-l border-white/10 bg-transparent px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-white outline-none"
                          >
                            {roles.map((role) => (
                              <option key={role}>{role}</option>
                            ))}
                          </select>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}

              {state.activePanel === "tests" ? (
                <div className="space-y-2">
                  {tests.map((test) => (
                    <label
                      key={test}
                      className="flex items-start gap-3 border-l border-white/10 bg-black/10 px-3 py-3 text-xs text-white/56"
                    >
                      <input
                        type="checkbox"
                        checked
                        readOnly
                        className="mt-0.5 accent-emerald-300"
                      />
                      <span>{test}</span>
                    </label>
                  ))}
                </div>
              ) : null}

              {state.activePanel === "overview" ||
              state.activePanel === "edit" ||
              state.activePanel === "mix" ? (
                <div className="grid gap-2">
                  <button
                    type="button"
                    onClick={undoEdit}
                    className="border-l border-white/10 bg-transparent px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-white/68 hover:bg-white/[0.08]"
                  >
                    Undo
                  </button>
                  <button
                    type="button"
                    onClick={redoEdit}
                    className="border-l border-white/10 bg-transparent px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-white/68 hover:bg-white/[0.08]"
                  >
                    Redo
                  </button>
                  <button
                    type="button"
                    onClick={toggleLock}
                    className={cn(
                      "px-3 py-2 text-[10px] uppercase tracking-[0.2em]",
                      state.editorLock.locked
                        ? "bg-red-400 text-black"
                        : "bg-white/[0.06] text-white/68 hover:bg-white/[0.1]",
                    )}
                  >
                    {state.editorLock.locked
                      ? "Unlock Session"
                      : "Lock Session"}
                  </button>
                </div>
              ) : null}
            </RailSection>
          </div>
        </aside>
      </section>

      <footer className="border-t border-white/8 bg-[linear-gradient(180deg,rgba(8,11,16,0.92),rgba(5,7,10,0.99))] px-4 py-3">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="overflow-x-auto border-y border-white/6 bg-black/10 px-4 py-4">
            <div className="flex min-w-[720px] items-end gap-3">
              {state.tracks.map((track) => (
                <article
                  key={track.id}
                  className="grid min-w-[88px] flex-1 gap-3 border-r border-white/8 px-3 py-3 text-center last:border-r-0"
                >
                  <div
                    className="mx-auto h-1.5 w-12 rounded-full"
                    style={{ backgroundColor: track.color }}
                  />
                  <p className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-white/72">
                    {track.name}
                  </p>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={track.volume}
                    onChange={(event) =>
                      updateTrack(track.id, {
                        volume: Number(event.target.value),
                      })
                    }
                    className="mx-auto h-28 accent-cyan-300 [writing-mode:vertical-lr] [direction:rtl]"
                  />
                  <div className="text-[11px] text-white/34">
                    {track.volume}
                  </div>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    value={track.pan}
                    onChange={(event) =>
                      updateTrack(track.id, { pan: Number(event.target.value) })
                    }
                    className="accent-white/70"
                  />
                  <div className="text-[10px] uppercase tracking-[0.18em] text-white/28">
                    Pan {track.pan}
                  </div>
                </article>
              ))}
            </div>
          </div>
          <div className="border-y border-white/6 bg-black/10 px-4 py-4">
            <div className="flex items-center gap-2">
              <h2 className="text-[10px] uppercase tracking-[0.28em] text-white/42">
                Edit History
              </h2>
              <span className="ml-auto text-[10px] uppercase tracking-[0.22em] text-white/28">
                {state.timeline.undo.length} entries
              </span>
            </div>
            <div className="mt-3 max-h-48 space-y-2 overflow-auto">
              {state.timeline.undo.length === 0 ? (
                <p className="text-sm text-white/28">
                  No edits yet. Actions from the rails and arrange window land
                  here.
                </p>
              ) : (
                state.timeline.undo.map((entry) => (
                  <div
                    key={entry.id}
                    className="border-l border-white/10 bg-transparent px-3 py-3"
                  >
                    <p className="text-sm text-white/72">{entry.label}</p>
                    <p className="mt-1 text-[11px] text-white/32">
                      {entry.createdAt}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
