export type StudioSaveState = "local-draft" | "saving-cloud" | "cloud-saved" | "offline-local" | "save-failed" | "conflict";

export type RecoverySaveEvent = {
  source: "local" | "cloud";
  projectId: string;
  fingerprint: string;
  savedAt: string;
};

export type StudioRecoveryEnvelope<T> = {
  schemaVersion: 3;
  projectId: string;
  updatedAt: string;
  project: T;
};

export function createRecoveryEnvelope<T extends { id: string }>(project: T, updatedAt = new Date().toISOString()): StudioRecoveryEnvelope<T> {
  return { schemaVersion: 3, projectId: project.id, updatedAt, project };
}

export function getSaveStatusText(state: StudioSaveState, timestamp?: string) {
  if (state === "local-draft") return timestamp ? `Local draft saved at ${timestamp}` : "Local draft saved";
  if (state === "saving-cloud") return "Saving to cloud…";
  if (state === "cloud-saved") return timestamp ? `Cloud saved at ${timestamp}` : "Cloud saved";
  if (state === "offline-local") return "Offline — saved locally";
  if (state === "save-failed") return "Cloud save failed — local draft preserved";
  return "Save conflict detected";
}

export function getCloudSaveFailure(error: unknown): { state: "local-draft" | "save-failed"; status: string; error: string | null } {
  if (error instanceof Error && "status" in error && error.status === 401) {
    return { state: "local-draft", status: "Local draft saved — sign in for cloud backup", error: null };
  }
  return {
    state: "save-failed",
    status: getSaveStatusText("save-failed"),
    error: error instanceof Error ? error.message : "Cloud save failed.",
  };
}

export function shouldCreateCloudCheckpoint(previousAt: number, nextAt: number, intervalMs = 60_000) {
  return nextAt - previousAt >= intervalMs;
}

export function compareRecoveryVersions<T extends { updatedAt: string }>(local: T, cloud: T) {
  const recommended = new Date(local.updatedAt).getTime() >= new Date(cloud.updatedAt).getTime() ? "local" : "cloud";
  return { local, cloud, recommended } as const;
}

export function getProjectHealth(value: { missingMedia: number; saveState: StudioSaveState; clipping: boolean }) {
  if (value.saveState === "save-failed" || value.saveState === "conflict") return { level:"error" as const, issues:["save"] };
  const issues = [...(value.missingMedia ? ["missing-media"] : []), ...(value.clipping ? ["clipping"] : []), ...(value.saveState !== "cloud-saved" ? ["save"] : [])];
  return { level: issues.length ? "warning" as const : "healthy" as const, issues };
}

export function saveLocalRecovery(projectId: string, value: unknown) {
  localStorage.setItem(`ems.studio.recovery.v3:${projectId}`, JSON.stringify(value));
}

export function loadLocalRecovery<T>(projectId: string): T | null {
  const value = localStorage.getItem(`ems.studio.recovery.v3:${projectId}`);
  if (!value) return null;
  try { return JSON.parse(value) as T; } catch { return null; }
}
