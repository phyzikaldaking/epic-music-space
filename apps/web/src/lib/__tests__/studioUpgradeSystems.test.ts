import { describe, expect, it } from "vitest";
import { classifyInputSignal, nextPreflightState } from "@/app/studio/try/studio/preflight";
import { compareRecoveryVersions, getProjectHealth } from "@/app/studio/try/studio/recovery";
import { setClipFade, stretchClip } from "@/app/studio/try/studio/editing";
import { validateRouting } from "@/app/studio/try/studio/mixing";
import { validateStudioFinish } from "@/app/studio/try/studio/finish";

const clip = { id:"c", name:"clip", url:"x", type:"audio/wav", size:1, duration:4, peaks:[], start:0, trimStart:0, trimEnd:0, fadeIn:0, fadeOut:0, gain:1, muted:false, locked:false };

describe("Studio upgrade systems", () => {
  it("classifies input readiness", () => {
    expect(classifyInputSignal(new Float32Array(64)).status).toBe("silent");
    expect(classifyInputSignal(Float32Array.from([0, .99, 0])).status).toBe("clipping");
    expect(nextPreflightState("permission-denied", "retry")).toBe("requesting-permission");
  });
  it("compares recovery without discarding either version", () => {
    const local = { updatedAt:"2026-08-22T10:00:00Z", id:"local" };
    const cloud = { updatedAt:"2026-08-22T09:00:00Z", id:"cloud" };
    expect(compareRecoveryVersions(local, cloud).recommended).toBe("local");
    expect(getProjectHealth({ missingMedia:1, saveState:"cloud-saved", clipping:false }).level).toBe("warning");
  });
  it("clamps non-destructive clip edits", () => {
    expect(setClipFade(clip, { fadeIn:99 }).fadeIn).toBe(4);
    expect(stretchClip(clip, .1).playbackRate).toBe(.25);
  });
  it("rejects routing cycles", () => {
    expect(validateRouting([{ from:"a", to:"b" }, { from:"b", to:"a" }]).valid).toBe(false);
  });
  it("blocks unusable exports and warns on clipping", () => {
    const result = validateStudioFinish({ missingMedia:1, clipping:true, saved:false, title:"" });
    expect(result.blocking.map((issue) => issue.code)).toContain("missing-media");
    expect(result.warnings.map((issue) => issue.code)).toContain("true-peak");
  });
});
