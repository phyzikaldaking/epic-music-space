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
});
