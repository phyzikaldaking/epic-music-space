import { describe, expect, it } from "vitest";
import { buildStudioHandoff, getDestinationPath, parseStudioHandoff, validateStudioFinish } from "@/app/studio/try/studio/finish";

const project = { id:"project-1", title:"Final Mix", updatedAt:"2026-08-22T20:00:00Z", tracks:2 };

describe("Studio finish and handoffs", () => {
  it("blocks missing media and warns before clipping delivery", () => {
    const result = validateStudioFinish({ missingMedia:1, clipping:true, saved:false, title:"" });
    expect(result.blocking.map((issue) => issue.code)).toContain("missing-media");
    expect(result.warnings.map((issue) => issue.code)).toEqual(expect.arrayContaining(["true-peak", "unsaved", "missing-title"]));
  });

  it("creates a reviewed Battle handoff without putting audio in the URL", () => {
    const handoff = buildStudioHandoff(project, "battle", { excerptStart:12, excerptEnd:72, format:"wav" });
    expect(handoff).toMatchObject({ destination:"battle", projectId:"project-1", sourceVersion:"2026-08-22T20:00:00Z", reviewRequired:true, excerpt:{ start:12, end:72 }, format:"wav" });
    expect(JSON.stringify(handoff)).not.toContain("blob:");
  });

  it("maps every reviewed destination to an existing route", () => {
    expect(getDestinationPath("publish")).toBe("/studio/new?source=studio");
    expect(getDestinationPath("marketplace")).toBe("/market/list?source=studio");
    expect(getDestinationPath("room")).toBe("/rooms/new?source=studio");
    expect(getDestinationPath("battle")).toBe("/versus/new?source=studio");
  });

  it("accepts only versioned, reviewed Studio handoffs", () => {
    const handoff = buildStudioHandoff(project, "battle");
    expect(parseStudioHandoff(JSON.stringify(handoff))?.projectId).toBe("project-1");
    expect(parseStudioHandoff('{"projectId":"project-1"}')).toBeNull();
  });
});
