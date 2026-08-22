export type GrooveTemplate = { id: string; name: string; steps: number; swing: number; offsets: number[]; velocities: number[] };

export function createGrooveTemplate(input: { id: string; name: string; steps: number; swing?: number; offsets?: number[]; velocities?: number[] }): GrooveTemplate {
  const steps = Math.max(1, Math.round(input.steps));
  return {
    id: input.id,
    name: input.name,
    steps,
    swing: Math.max(0, Math.min(.75, input.swing ?? 0)),
    offsets: Array.from({ length: steps }, (_, index) => Math.round(input.offsets?.[index] ?? 0)),
    velocities: Array.from({ length: steps }, (_, index) => Math.max(0, Math.min(2, input.velocities?.[index] ?? 1))),
  };
}

export function applyGroove(tick: number, groove: GrooveTemplate, ticksPerSubdivision: number) {
  const subdivision = Math.max(1, Math.round(ticksPerSubdivision));
  const baseTick = Math.max(0, Math.round(tick));
  const step = Math.floor(baseTick / subdivision) % groove.steps;
  const swingOffset = step % 2 === 1 ? Math.round(subdivision * groove.swing) : 0;
  return { tick: Math.max(0, baseTick + swingOffset + (groove.offsets[step] ?? 0)), velocityScale: groove.velocities[step] ?? 1 };
}

export function tickToTransportSeconds(tick: number, clock: { bpm: number; ppq: number }) {
  return Math.max(0, tick) / Math.max(1, clock.ppq) * 60 / Math.max(1, clock.bpm);
}
