import { describe, expect, it } from "vitest";
import {
  compareRecoveryVersions,
  createRecoveryEnvelope,
  getCloudSaveFailure,
  getProjectHealth,
  getSaveStatusText,
  shouldCreateCloudCheckpoint,
} from "@/app/studio/try/studio/recovery";

describe("Studio recovery", () => {
  it("recommends the newest recovery without discarding either version", () => {
    const local = { updatedAt: "2026-08-22T10:00:00Z", id: "local" };
    const cloud = { updatedAt: "2026-08-22T09:00:00Z", id: "cloud" };

    expect(compareRecoveryVersions(local, cloud)).toMatchObject({
      local,
      cloud,
      recommended: "local",
    });
  });

  it("wraps local drafts in a versioned recovery envelope", () => {
    const project = { id: "project-1", title: "Late Night Mix" };

    expect(createRecoveryEnvelope(project, "2026-08-22T10:30:00Z")).toEqual({
      schemaVersion: 3,
      projectId: "project-1",
      updatedAt: "2026-08-22T10:30:00Z",
      project,
    });
  });

  it("uses explicit, user-facing save states", () => {
    expect(getSaveStatusText("local-draft", "10:30 PM")).toBe("Local draft saved at 10:30 PM");
    expect(getSaveStatusText("saving-cloud")).toBe("Saving to cloud…");
    expect(getSaveStatusText("conflict")).toBe("Save conflict detected");
  });

  it("keeps an unauthorized guest save as a successful local draft", () => {
    const error = Object.assign(new Error("Unauthorized"), { status: 401 });

    expect(getCloudSaveFailure(error)).toEqual({
      state: "local-draft",
      status: "Local draft saved — sign in for cloud backup",
      error: null,
    });
  });

  it("creates cloud checkpoints only after meaningful elapsed time", () => {
    expect(shouldCreateCloudCheckpoint(1_000, 61_000, 60_000)).toBe(true);
    expect(shouldCreateCloudCheckpoint(1_000, 30_000, 60_000)).toBe(false);
  });

  it("reports missing media even when the cloud save is current", () => {
    expect(getProjectHealth({ missingMedia: 1, saveState: "cloud-saved", clipping: false })).toEqual({
      level: "warning",
      issues: ["missing-media"],
    });
  });
});
