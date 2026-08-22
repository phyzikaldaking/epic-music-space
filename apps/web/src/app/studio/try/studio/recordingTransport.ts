export type RecordingTransportSettings = {
  bpm: number;
  beatsPerBar: number;
  countInBars: 1 | 2 | 4;
  metronomeVolume: number;
  subdivision: "1/4" | "1/8" | "1/16";
  accentDownbeat: boolean;
};

function positiveTempo(bpm: number) {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new Error("Tempo must be greater than zero.");
  return bpm;
}

export function countInDurationSeconds(input: { bpm: number; bars: 1 | 2 | 4; beatsPerBar: number }) {
  if (!Number.isInteger(input.beatsPerBar) || input.beatsPerBar < 1) throw new Error("Beats per bar must be a positive integer.");
  return Number(((60 / positiveTempo(input.bpm)) * input.beatsPerBar * input.bars).toFixed(6));
}

const SUBDIVISIONS = { "1/4": 1, "1/8": 2, "1/16": 4 } as const;

export function metronomeEventTimes(input: {
  startAtSec: number;
  bpm: number;
  bars: number;
  beatsPerBar: number;
  subdivision: keyof typeof SUBDIVISIONS;
  accentDownbeat: boolean;
}) {
  const subdivisions = SUBDIVISIONS[input.subdivision];
  const eventCount = input.bars * input.beatsPerBar * subdivisions;
  const stepSec = 60 / positiveTempo(input.bpm) / subdivisions;
  return Array.from({ length: eventCount }, (_, index) => ({
    atSec: Number((input.startAtSec + index * stepSec).toFixed(6)),
    accent: input.accentDownbeat && index % (input.beatsPerBar * subdivisions) === 0,
  }));
}

export function nextPunchTransition(positionSec: number, range: { inSec: number; outSec: number }, recording: boolean): "start" | "stop" | "none" {
  if (!recording && positionSec >= range.inSec && positionSec < range.outSec) return "start";
  if (recording && positionSec >= range.outSec) return "stop";
  return "none";
}
