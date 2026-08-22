import { describe, expect, it } from "vitest";
import { NATIVE_EFFECTS, createNativeEffect } from "@/app/studio/try/studio/nativeEffects";

describe("Studio native effects rack", () => {
  it("contains every required native processor", () => {
    expect(NATIVE_EFFECTS.map((effect) => effect.kind)).toEqual(["eq", "compressor", "limiter", "gate", "saturation", "reverb", "delay", "chorus", "de-esser", "pitch-correction"]);
  });
  it("creates a versioned bypassable instance with bounded defaults", () => {
    expect(createNativeEffect("compressor", "fx-1")).toMatchObject({ id: "fx-1", kind: "compressor", version: 1, bypassed: false, parameters: { thresholdDb: -18, ratio: 4 } });
  });
});
