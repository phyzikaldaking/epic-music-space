import { describe, expect, it } from "vitest";

import {
  getFirstSessionStep,
  getProjectMenuItems,
  getStudioCommandIds,
  getStudioTasks,
} from "@/app/studio/try/studio/workspace";
import { getPreflightChecklist } from "@/app/studio/try/studio/preflight";

describe("visible Studio upgrade batch", () => {
  it("keeps Creator Mode focused on the current task", () => {
    expect(getStudioCommandIds("creator", "create", false)).toEqual(["new", "import", "record"]);
    expect(getStudioCommandIds("creator", "arrange", true)).toEqual(["new", "import", "undo-redo", "zoom"]);
  });

  it("preserves precision controls in Engineer Mode", () => {
    expect(getStudioCommandIds("engineer", "arrange", true)).toContain("precision-tools");
    expect(getProjectMenuItems()).toEqual(["new", "save-as", "restore", "snapshot", "archive", "settings"]);
  });

  it("offers a musician-facing four-task Creator journey", () => {
    expect(getStudioTasks().map((item) => item.label)).toEqual(["Create", "Arrange", "Mix", "Finish"]);
  });

  it("moves the first-session guide from start to editing and saving", () => {
    expect(getFirstSessionStep({ trackCount: 0, editCount: 0, cloudSaved: false, finished: false })).toBe("choose-start");
    expect(getFirstSessionStep({ trackCount: 1, editCount: 0, cloudSaved: false, finished: false })).toBe("make-edit");
    expect(getFirstSessionStep({ trackCount: 1, editCount: 2, cloudSaved: false, finished: false })).toBe("save-cloud");
    expect(getFirstSessionStep({ trackCount: 1, editCount: 2, cloudSaved: true, finished: false })).toBe("finish-check");
  });

  it("explains every recording readiness boundary", () => {
    expect(getPreflightChecklist({ supported: false, permission: "unknown", signal: "silent" }).map((item) => item.status)).toEqual(["fail", "pending", "pending"]);
    expect(getPreflightChecklist({ supported: true, permission: "granted", signal: "healthy" }).every((item) => item.status === "pass")).toBe(true);
  });
});
