import { describe, expect, it } from "vitest";

import {
  createTemplateSession,
  getVisibleStudioPanels,
  hydrateWorkspaceState,
} from "@/app/studio/try/studio/workspace";

describe("Studio workspace model", () => {
  it("reveals only useful panels in Creator Mode", () => {
    expect(getVisibleStudioPanels({ experience: "creator", task: "create", trackCount: 0, hasSelection: false })).toEqual(["start"]);
    expect(getVisibleStudioPanels({ experience: "creator", task: "arrange", trackCount: 2, hasSelection: false })).toEqual(["tracks", "timeline"]);
  });

  it("reveals precision editing in Engineer Mode", () => {
    expect(getVisibleStudioPanels({ experience: "engineer", task: "arrange", trackCount: 2, hasSelection: true })).toContain("precision-edit");
  });

  it("creates practical sessions without fake audio", () => {
    const vocal = createTemplateSession("vocal");
    expect(vocal.tracks.map((track) => track.name)).toEqual(["Lead Vocal", "Vocal Double", "Instrumental"]);
    expect(vocal.tracks.every((track) => track.clips.length === 0)).toBe(true);
    expect(vocal.sampleRate).toBe(48_000);
  });

  it("hydrates legacy projects into the full workspace", () => {
    expect(hydrateWorkspaceState({})).toEqual({ schemaVersion: 3, experienceMode: "engineer", task: "arrange", templateId: "empty" });
  });
});
