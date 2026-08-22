import { describe, expect, it } from "vitest";
import { applyMixSuggestion, getMeterState, removeMixSuggestion, searchEffects, validateRouting } from "@/app/studio/try/studio/mixing";

describe("Studio mixing systems", () => {
  it("rejects routing cycles", () => {
    expect(validateRouting([{ from:"a", to:"b" }, { from:"b", to:"a" }])).toEqual({ valid:false, reason:"Routing cycle detected" });
  });

  it("applies and removes a suggestion as a reversible patch", () => {
    const session = { tracks: [{ id:"lead", volume:82, pan:0 }] };
    const suggestion = { id:"gain-stage", trackId:"lead", patch:{ volume:72 }, previous:{ volume:82 } };
    expect(removeMixSuggestion(applyMixSuggestion(session, suggestion), suggestion)).toEqual(session);
  });

  it("classifies clipping from peak level", () => {
    expect(getMeterState({ peakDb:.2, rmsDb:-8 })).toEqual({ clipping:true, tone:"danger" });
  });

  it("searches effects by name and category", () => {
    expect(searchEffects("vocal").map((effect) => effect.id)).toContain("vocal-polish");
  });
});
