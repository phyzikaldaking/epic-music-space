import { describe, expect, it } from "vitest";
import { compareRecoveryManifests, createRecoveryManifest, isRecoveryManifest, migrateRecoveryManifest, preserveBothRecovery } from "@/app/studio/try/studio/recoveryManifest";

const project = {
  id: "project-1", title: "Song", bpm: 92, sampleRate: 48_000, updatedAt: "2026-08-22T01:00:00.000Z", snapshots: [],
  tracks: [{ id: "track-1", name: "Vocal", color: "#fff", armed: true, muted: false, solo: false, volume: 80, pan: 0, inputGain: 50, clips: [{ id: "clip-1", sourceId: "source-1", name: "take.wav", url: "https://cdn/take.wav", type: "audio/wav", size: 100, duration: 4, peaks: [], start: 0, trimStart: 0, trimEnd: 0, fadeIn: 0, fadeOut: 0, gain: 0, muted: false, locked: false }] }],
};

describe("Studio recovery manifests", () => {
  it("stores stable media descriptors without copying audio blobs into project history", () => {
    const manifest = createRecoveryManifest(project);
    expect(manifest).toMatchObject({ schemaVersion: 4, projectId: "project-1", media: [{ sourceId: "source-1", fileName: "take.wav", sizeBytes: 100, durationSec: 4, status: "available" }] });
    expect(JSON.stringify(manifest)).not.toContain("blob:");
    expect(isRecoveryManifest(manifest)).toBe(true);
    expect(isRecoveryManifest({ ...manifest, media: "invalid" })).toBe(false);
  });

  it("migrates schema-v3 envelopes and marks unresolved object URLs as missing", () => {
    const manifest = migrateRecoveryManifest({ schemaVersion: 3, projectId: "project-1", updatedAt: project.updatedAt, project: { ...project, tracks: [{ ...project.tracks[0], clips: [{ ...project.tracks[0].clips[0], url: "blob:lost" }] }] } });
    expect(manifest.schemaVersion).toBe(4);
    expect(manifest.media[0]).toMatchObject({ sourceId: "source-1", status: "missing" });
  });

  it("chooses the newest valid manifest while preserve-both creates a deterministic recovered ID", () => {
    const local = createRecoveryManifest(project);
    const cloud = createRecoveryManifest({ ...project, updatedAt: "2026-08-22T02:00:00.000Z" });
    expect(compareRecoveryManifests(local, cloud).recommended).toBe("cloud");
    expect(preserveBothRecovery(local, "2026-08-22T03:00:00.000Z").project.id).toBe("project-1-recovered-20260822t030000000z");
  });
});
