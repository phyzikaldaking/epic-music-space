import type {
  StudioExperienceMode,
  StudioSavedSession,
  StudioTask,
  StudioTemplateId,
  StudioTrack,
} from "./types";

export type StudioPanelId = "start" | "tracks" | "timeline" | "inspector" | "region" | "mixer" | "finish" | "precision-edit";

export type StudioWorkspaceState = {
  experience: StudioExperienceMode;
  task: StudioTask;
  trackCount: number;
  hasSelection: boolean;
};

export function getVisibleStudioPanels(state: StudioWorkspaceState): StudioPanelId[] {
  if (state.trackCount === 0) return ["start"];
  const panels: StudioPanelId[] = ["tracks", "timeline"];
  if (state.hasSelection) panels.push("inspector", "region");
  if (state.task === "mix") panels.push("mixer");
  if (state.task === "finish") panels.push("finish");
  if (state.experience === "engineer") panels.push("precision-edit");
  return panels;
}

const colors = ["#65d6ff", "#a78bfa", "#f9d66a", "#42e89d"];

function track(name: string, index: number, armed = false): StudioTrack {
  return { id: `template-${index}-${name.toLowerCase().replace(/\W+/g, "-")}`, name, color: colors[index % colors.length], armed, muted: false, solo: false, volume: 80, pan: 0, inputGain: 50, clips: [] };
}

const templates: Record<StudioTemplateId, { bpm: number; names: string[]; armed?: number }> = {
  vocal: { bpm: 92, names: ["Lead Vocal", "Vocal Double", "Instrumental"], armed: 0 },
  beat: { bpm: 100, names: ["Drums", "Bass", "Music"] },
  podcast: { bpm: 90, names: ["Host", "Guest", "Music Bed"], armed: 0 },
  stems: { bpm: 100, names: ["Drums", "Bass", "Vocals", "Music"] },
  mastering: { bpm: 100, names: ["Premaster"] },
  empty: { bpm: 92, names: [] },
};

export function createTemplateSession(templateId: StudioTemplateId): Pick<StudioSavedSession, "bpm" | "sampleRate" | "tracks"> {
  const preset = templates[templateId];
  return { bpm: preset.bpm, sampleRate: 48_000, tracks: preset.names.map((name, index) => track(name, index, index === preset.armed)) };
}

export function hydrateWorkspaceState(value: Partial<StudioSavedSession>) {
  return {
    schemaVersion: value.schemaVersion ?? 3,
    experienceMode: value.experienceMode ?? "engineer",
    task: value.task ?? "arrange",
    templateId: value.templateId ?? "empty",
  } as const;
}

export type StudioCommandId = "new" | "import" | "record" | "undo-redo" | "zoom" | "precision-tools";

export function getStudioCommandIds(experience: StudioExperienceMode, task: StudioTask, hasTracks: boolean): StudioCommandId[] {
  const ids: StudioCommandId[] = ["new", "import"];
  if (task === "create") ids.push("record");
  if (hasTracks) ids.push("undo-redo", "zoom");
  if (experience === "engineer") ids.push("precision-tools");
  return ids;
}

export function getProjectMenuItems() {
  return ["new", "save-as", "restore", "snapshot", "archive", "settings"] as const;
}

export function getStudioTasks() {
  return [
    { id: "create" as const, label: "Create" },
    { id: "arrange" as const, label: "Arrange" },
    { id: "mix" as const, label: "Mix" },
    { id: "finish" as const, label: "Finish" },
  ];
}

export type FirstSessionStep = "choose-start" | "make-edit" | "save-cloud" | "finish-check" | "complete";

export function getFirstSessionStep(value: { trackCount: number; editCount: number; cloudSaved: boolean; finished: boolean }): FirstSessionStep {
  if (value.finished) return "complete";
  if (value.trackCount === 0) return "choose-start";
  if (value.editCount === 0) return "make-edit";
  if (!value.cloudSaved) return "save-cloud";
  return "finish-check";
}
