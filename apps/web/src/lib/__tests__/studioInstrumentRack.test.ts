import { describe, expect, it } from "vitest";
import { createStarterInstrumentRack, selectRackInstrument } from "@/app/studio/try/studio/instrumentRack";

describe("Studio instrument rack", () => {
  it("ships every required starter voice", () => {
    expect(createStarterInstrumentRack().instruments.map((item) => item.kind)).toEqual(["sampler", "drum-rack", "subtractive-synth", "keys", "bass", "pads", "orchestral"]);
  });

  it("selects an instrument without discarding rack state", () => {
    const rack = createStarterInstrumentRack();
    const selected = selectRackInstrument(rack, "bass");
    expect(selected.activeId).toBe("bass");
    expect(selected.instruments).toEqual(rack.instruments);
  });
});
