import { describe, expect, it } from "vitest";
import { productionProjectToSession, studioProjectToSession, toStudioProjectPayload } from "@/app/studio/try/studio/api";
import { hydrateWorkspaceState } from "@/app/studio/try/studio/workspace";

describe("Studio legacy compatibility", () => {
  it("opens pre-upgrade projects in Engineer arrange mode", () => {
    const legacy = studioProjectToSession({ id:"legacy-1", name:"Legacy Session", bpm:88, updatedAt:"2025-01-01T00:00:00Z", patternJson:{ tracks:[], sampleRate:44100, snapshots:[] } });
    expect(hydrateWorkspaceState(legacy)).toMatchObject({ experienceMode:"engineer", task:"arrange", templateId:"empty" });
  });

  it("preserves legacy project identity in save payloads", () => {
    const session = { id:"legacy-1", title:"Legacy Session", bpm:88, sampleRate:44100, updatedAt:"2025-01-01T00:00:00Z", tracks:[], snapshots:[] };
    expect(toStudioProjectPayload(session, false)).toMatchObject({ id:"legacy-1", name:"Legacy Session", bpm:88 });
  });

  it("preserves recording setup when a production project overlays cloud tracks", () => {
    const session = productionProjectToSession({
      project: {
        id: "project-1",
        name: "Recording Session",
        bpm: 92,
        updatedAt: "2026-08-22T00:00:00.000Z",
        patternJson: {
          id: "project-1",
          title: "Recording Session",
          bpm: 92,
          sampleRate: 48_000,
          updatedAt: "2026-08-22T00:00:00.000Z",
          tracks: [],
          snapshots: [],
          recordingDevice: { inputDeviceId: "mic-2", outputDeviceId: "speaker-1", channelCount: 2 },
          recordingLatency: { inputMs: 18, outputMs: 12, baseMs: 6, measuredAt: "2026-08-22T00:00:00.000Z" },
          countInBars: 4,
        },
      },
      tracks: [], clips: [], audioFiles: [],
    });

    expect(session).toMatchObject({
      recordingDevice: { inputDeviceId: "mic-2", outputDeviceId: "speaker-1", channelCount: 2 },
      recordingLatency: { inputMs: 18, outputMs: 12, baseMs: 6 },
      countInBars: 4,
    });
  });
  it("preserves durable uploaded clips while excluding local blob clips", () => {
    const session = {
      id: "project-1", title: "Cloud Session", bpm: 96, sampleRate: 48_000,
      updatedAt: "2026-08-24T00:00:00.000Z",
      tracks: [{
        id: "track-1", name: "Lead", color: "#65d6ff", armed: true, muted: false, solo: false,
        volume: 78, pan: 0, inputGain: 60,
        clips: [
          { id: "clip-cloud", name: "Cloud Take.wav", url: "https://cdn.example.test/cloud.wav", type: "audio/wav", size: 123, duration: 2, peaks: [0.1, 0.8], start: 1, trimStart: 0, trimEnd: 0, fadeIn: 0, fadeOut: 0, gain: -1, muted: false, locked: false, color: "#65d6ff", missing: false, sourceId: "audio-file-1" },
          { id: "clip-local", name: "Local Take.webm", url: "blob:https://example.test/local", type: "audio/webm", size: 123, duration: 1, peaks: [], start: 0, trimStart: 0, trimEnd: 0, fadeIn: 0, fadeOut: 0, gain: 0, muted: false, locked: false, color: "#a78bfa", missing: false },
        ],
      }],
      snapshots: [],
    };

    const payload = toStudioProjectPayload(session, false);
    expect(payload.clips).toHaveLength(1);
    expect(payload.clips[0]).toMatchObject({ id: "clip-cloud", trackId: "track-1", audioFileId: "audio-file-1", startSec: 1, durationSec: 2 });
    expect(payload.clips.find((clip) => clip.id === "clip-local")).toBeUndefined();
  });

});
