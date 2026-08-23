export type BeatStemPad = {
  id: string;
  label: string;
  freq: number;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  steps: boolean[];
};

export type BeatStemRenderPlan = {
  id: string;
  label: string;
  fileName: string;
  durationSec: number;
  frequency: number;
  volume: number;
  pan: number;
  hitTimesSec: number[];
};

export function buildBeatStemRenderPlan(pads: BeatStemPad[], bpm: number): BeatStemRenderPlan[] {
  const safeBpm = Math.max(40, bpm);
  const stepDuration = 60 / safeBpm / 4;
  const totalSteps = Math.max(0, ...pads.map((pad) => pad.steps.length));
  const durationSec = Number((totalSteps * stepDuration + 0.75).toFixed(6));
  const soloed = pads.some((pad) => pad.solo);

  return pads
    .filter((pad) => !pad.muted && (!soloed || pad.solo))
    .map((pad) => ({
      id: pad.id,
      label: pad.label,
      fileName: `Beat ${safeBpm} BPM - ${pad.label}.wav`,
      durationSec,
      frequency: pad.freq,
      volume: pad.volume,
      pan: pad.pan,
      hitTimesSec: pad.steps.flatMap((enabled, index) => enabled ? [Number((index * stepDuration).toFixed(6))] : []),
    }));
}
