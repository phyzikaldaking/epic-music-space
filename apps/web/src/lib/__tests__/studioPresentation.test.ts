import { describe, expect, it } from "vitest";

import {
  getEmptyStudioActions,
  getStudioAlert,
  getStudioModeLabel,
  getStudioSaveTone,
} from "@/app/studio/try/studio/presentation";

describe("Studio presentation semantics", () => {
  it("keeps save, dirty, and offline states visually distinct", () => {
    expect(getStudioSaveTone("Saved 12:30")).toEqual({ tone: "saved", label: "Saved 12:30" });
    expect(getStudioSaveTone("Unsaved changes")).toEqual({ tone: "dirty", label: "Unsaved changes" });
    expect(getStudioSaveTone("Offline: cloud save paused")).toEqual({ tone: "offline", label: "Offline: cloud save paused" });
  });

  it("prioritizes the most actionable workspace alert", () => {
    expect(getStudioAlert("Decode failed", "Another tab", true, 2)?.message).toBe("Decode failed");
    expect(getStudioAlert(null, "Another tab", true, 2)?.message).toBe("Another tab");
    expect(getStudioAlert(null, null, true, 2)?.message).toContain("Offline");
    expect(getStudioAlert(null, null, false, 2)?.message).toContain("2 clips");
  });

  it("offers the three fastest ways to start a session", () => {
    expect(getEmptyStudioActions().map(({ id, label }) => ({ id, label }))).toEqual([
      { id: "import", label: "Import Audio" },
      { id: "record", label: "Record" },
      { id: "beat", label: "Beat Machine" },
    ]);
  });

  it("uses musician-facing mode labels", () => {
    expect(["edit", "mix", "beat", "export", "files"].map((mode) => getStudioModeLabel(mode as never))).toEqual([
      "Timeline",
      "Mixer",
      "Beat Lab",
      "Master & Export",
      "Cloud Files",
    ]);
  });
});
