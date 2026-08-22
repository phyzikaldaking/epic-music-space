export type NativeEffectKind = "eq" | "compressor" | "limiter" | "gate" | "saturation" | "reverb" | "delay" | "chorus" | "de-esser" | "pitch-correction";
export const NATIVE_EFFECTS: Array<{ kind: NativeEffectKind; name: string; defaults: Record<string, number> }> = [
  { kind: "eq", name: "Platinum EQ", defaults: { frequencyHz: 1000, gainDb: 0, q: 1 } },
  { kind: "compressor", name: "Bus Compressor", defaults: { thresholdDb: -18, ratio: 4 } },
  { kind: "limiter", name: "True Peak Limiter", defaults: { ceilingDb: -1, releaseMs: 100 } },
  { kind: "gate", name: "Noise Gate", defaults: { thresholdDb: -40, releaseMs: 80 } },
  { kind: "saturation", name: "Analog Heat", defaults: { driveDb: 3, mix: 1 } },
  { kind: "reverb", name: "Studio Reverb", defaults: { decaySec: 1.8, mix: .2 } },
  { kind: "delay", name: "Tempo Delay", defaults: { feedback: .3, mix: .2 } },
  { kind: "chorus", name: "Wide Chorus", defaults: { rateHz: 1.2, depth: .4 } },
  { kind: "de-esser", name: "Vocal De-Esser", defaults: { frequencyHz: 6500, amount: .5 } },
  { kind: "pitch-correction", name: "Pitch Correction", defaults: { speedMs: 40, amount: 1 } },
];

export function createNativeEffect(kind: NativeEffectKind, id: string) {
  const definition = NATIVE_EFFECTS.find((effect) => effect.kind === kind)!;
  return { id, kind, name: definition.name, version: 1, bypassed: false, parameters: { ...definition.defaults } };
}
