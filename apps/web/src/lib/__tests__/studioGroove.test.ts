import { describe, expect, it } from "vitest";
import { applyGroove, createGrooveTemplate, tickToTransportSeconds } from "@/app/studio/try/studio/groove";

describe("Studio swing and groove clock", () => {
  it("applies swing to offbeats while downbeats remain fixed", () => {
    const groove = createGrooveTemplate({ id: "swing", name: "Swing", steps: 4, swing: .5 });
    expect([0, 240, 480, 720].map((tick) => applyGroove(tick, groove, 240).tick)).toEqual([0, 360, 480, 840]);
  });

  it("reuses per-step timing and velocity accents", () => {
    const groove = createGrooveTemplate({ id: "human", name: "Human", steps: 2, swing: 0, offsets: [10, -5], velocities: [1.1, .8] });
    expect(applyGroove(0, groove, 240)).toEqual({ tick: 10, velocityScale: 1.1 });
    expect(applyGroove(240, groove, 240)).toEqual({ tick: 235, velocityScale: .8 });
  });

  it("uses the transport BPM and PPQ clock", () => {
    expect(tickToTransportSeconds(960, { bpm: 120, ppq: 960 })).toBe(.5);
  });
});
