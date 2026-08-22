import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchRecentStudioProjects,
  productionProjectToSession,
  serializeStudioSession,
  studioProjectToSession,
} from "@/app/studio/try/studio/api";
import type { StudioSavedSession } from "@/app/studio/try/studio/types";

const saved: StudioSavedSession = {
  id: "project-1",
  title: "Cloud Song",
  bpm: 96,
  sampleRate: 48_000,
  updatedAt: "2026-08-22T00:00:00.000Z",
  snapshots: [],
  experienceMode: "engineer",
  task: "mix",
  templateId: "stems",
  tracks: [{
    id: "track-1", name: "Lead", color: "#65d6ff", armed: false, muted: false, solo: false, volume: 74, pan: -12, inputGain: 55,
    inserts: [{ id: "insert-1", effectId: "compressor", bypassed: false }],
    sends: [{ busId: "reverb", level: 24 }],
    outputBusId: "mix-bus",
    clips: [{ id: "clip-1", sourceId: "audio-1", name: "Lead.wav", url: "blob:temporary", type: "audio/wav", size: 400, duration: 8, peaks: [0.2], start: 2, trimStart: 0.25, trimEnd: 0.5, fadeIn: 0.1, fadeOut: 0.2, gain: 1, muted: false, locked: false, playbackRate: 1.05, pitchSemitones: 2 }],
  }],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Studio cross-device hydration", () => {
  it("keeps signed-out creators in local-draft mode when cloud projects return 401", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    )));

    await expect(fetchRecentStudioProjects()).resolves.toEqual([]);
  });

  it("overlays production media without dropping mixer or clip edit fields", () => {
    const session = productionProjectToSession({
      project: { id: saved.id, name: saved.title, bpm: saved.bpm, updatedAt: saved.updatedAt, patternJson: saved },
      tracks: [{ id: "track-1", name: "Lead", color: "#65d6ff", durationSec: 8, position: 0 }],
      clips: [{ id: "clip-1", trackId: "track-1", audioFileId: "audio-1", startSec: 3 }],
      audioFiles: [{ id: "audio-1", storageUrl: "https://cdn.example/lead.wav", fileName: "Lead.wav", durationSec: 8 }],
    });

    expect(session).toMatchObject({ experienceMode: "engineer", task: "mix", templateId: "stems" });
    expect(session.tracks[0]).toMatchObject({ outputBusId: "mix-bus", inserts: saved.tracks[0].inserts, sends: saved.tracks[0].sends });
    expect(session.tracks[0].clips[0]).toMatchObject({ sourceId: "audio-1", url: "https://cdn.example/lead.wav", start: 3, playbackRate: 1.05, pitchSemitones: 2, missing: false });
  });

  it("retains an editable placeholder when cloud media is missing", () => {
    const session = productionProjectToSession({
      project: { id: saved.id, name: saved.title, bpm: saved.bpm, updatedAt: saved.updatedAt, patternJson: saved },
      tracks: [{ id: "track-1", name: "Lead", color: "#65d6ff", durationSec: 8, position: 0 }],
      clips: [{ id: "clip-1", trackId: "track-1", audioFileId: "audio-1" }],
      audioFiles: [],
    });
    expect(session.tracks[0].clips[0]).toMatchObject({ id: "clip-1", sourceId: "audio-1", missing: true, url: "" });
  });

  it("serializes temporary media safely and round-trips all canonical fields", () => {
    const serialized = serializeStudioSession(saved);
    expect(serialized).toMatchObject({ schemaVersion: 4, tracks: [{ clips: [{ sourceId: "audio-1", url: "", missing: true }] }] });
    const hydrated = studioProjectToSession({ id: saved.id, name: saved.title, bpm: saved.bpm, updatedAt: saved.updatedAt, patternJson: serialized });
    expect(hydrated.tracks[0]).toMatchObject({ inserts: saved.tracks[0].inserts, sends: saved.tracks[0].sends });
    expect(hydrated.tracks[0].clips[0]).toMatchObject({ playbackRate: 1.05, pitchSemitones: 2 });
  });
});
