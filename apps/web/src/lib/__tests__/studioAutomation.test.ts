import { describe, expect, it } from "vitest";
import { createAutomationLane, evaluateAutomation, writeAutomationPoint } from "@/app/studio/try/studio/automation";

describe("Studio automation lanes", () => {
  it("supports all required target domains", () => {
    expect(["volume", "pan", "send", "effect", "bypass", "instrument"].map((target) => createAutomationLane({ id: target, target: target as never, parameterId: "value" }).target)).toEqual(["volume", "pan", "send", "effect", "bypass", "instrument"]);
  });
  it("writes sorted points and interpolates continuous values", () => {
    let lane = createAutomationLane({ id: "volume", target: "volume", parameterId: "gain" });
    lane = writeAutomationPoint(lane, { frame: 100, value: 1 });
    lane = writeAutomationPoint(lane, { frame: 0, value: 0 });
    expect(lane.points.map((point) => point.frame)).toEqual([0, 100]);
    expect(evaluateAutomation(lane, 50)).toBe(.5);
  });
  it("holds discrete bypass automation", () => {
    let lane = createAutomationLane({ id: "bypass", target: "bypass", parameterId: "fx-1" });
    lane = writeAutomationPoint(lane, { frame: 0, value: 0 });
    lane = writeAutomationPoint(lane, { frame: 100, value: 1 });
    expect(evaluateAutomation(lane, 50)).toBe(0);
  });
});
