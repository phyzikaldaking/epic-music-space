export type UndoRedoAction = {
  id: string;
  label: string;
  timestamp: string;
  before: unknown;
  after: unknown;
};

export type StudioProjectBinding = {
  projectId: string;
  sessionId: string;
  roomId: string;
  ownerId?: string;
  title: string;
  updatedAt: string;
};

export type ExportJob = {
  id: string;
  projectId: string;
  sessionId: string;
  format: "full_mix" | "stems" | "preview" | "license_package";
  status: "queued" | "rendering" | "complete" | "failed";
  progress: number;
  createdAt: string;
  updatedAt: string;
};

export type MidiEvent = {
  id: string;
  sessionId: string;
  deviceId?: string;
  type: "note_on" | "note_off" | "cc" | "transport";
  note?: number;
  velocity?: number;
  controller?: number;
  value?: number;
  channel?: number;
  createdAt: string;
};

export type ModerationSignal = {
  id: string;
  scope: "marketplace" | "live_room" | "dmca" | "spam";
  severity: "low" | "medium" | "high";
  targetId: string;
  reason: string;
  status: "open" | "reviewing" | "resolved";
  createdAt: string;
};

export function createUndoAction(label: string, before: unknown, after: unknown): UndoRedoAction {
  return { id: `undo-${Date.now()}-${crypto.randomUUID()}`, label, before, after, timestamp: new Date().toISOString() };
}

export function applyUndoStack(stack: UndoRedoAction[], action: UndoRedoAction, limit = 100) {
  return [action, ...stack].slice(0, limit);
}

export function bindStudioProject(input: Partial<StudioProjectBinding>): StudioProjectBinding {
  const now = new Date().toISOString();
  return {
    projectId: input.projectId ?? "ems-default-project",
    sessionId: input.sessionId ?? "ems-main-session",
    roomId: input.roomId ?? "ems-main-room",
    ownerId: input.ownerId,
    title: input.title ?? "Untitled EMS Studio Project",
    updatedAt: now,
  };
}

export function createExportJob(projectId: string, sessionId: string, format: ExportJob["format"]): ExportJob {
  const now = new Date().toISOString();
  return { id: `export-${Date.now()}-${crypto.randomUUID()}`, projectId, sessionId, format, status: "queued", progress: 0, createdAt: now, updatedAt: now };
}

export function scoreRecommendation(item: { plays?: number; likes?: number; purchases?: number; recency?: number; trust?: number }) {
  return (item.plays ?? 0) * 0.15 + (item.likes ?? 0) * 0.3 + (item.purchases ?? 0) * 0.9 + (item.recency ?? 0) * 0.25 + (item.trust ?? 0) * 1.2;
}

export function detectSpamSignal(input: { text?: string; linkCount?: number; duplicateCount?: number; reportCount?: number }): ModerationSignal | null {
  const text = input.text ?? "";
  const aggressive = /(free\s*money|click\s*now|crypto\s*drop|telegram|whatsapp)/i.test(text);
  const score = (input.linkCount ?? 0) + (input.duplicateCount ?? 0) * 2 + (input.reportCount ?? 0) * 4 + (aggressive ? 5 : 0);
  if (score < 5) return null;
  return {
    id: `mod-${Date.now()}-${crypto.randomUUID()}`,
    scope: "spam",
    severity: score > 10 ? "high" : "medium",
    targetId: "unknown",
    reason: "Automated anti-spam signal threshold exceeded",
    status: "open",
    createdAt: new Date().toISOString(),
  };
}
