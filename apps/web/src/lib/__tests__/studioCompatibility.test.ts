import { describe, expect, it } from "vitest";
import { studioProjectToSession, toStudioProjectPayload } from "@/app/studio/try/studio/api";
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
});
