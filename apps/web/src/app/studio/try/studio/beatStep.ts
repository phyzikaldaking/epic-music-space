export type StudioBeatStep = { id: string; active: boolean; lengthTicks: number; subdivision: number; triplet: boolean; flamTicks: number; ratchet: number; probability: number; velocity: number; microtimingTicks: number };

export function createBeatStep(input: Partial<StudioBeatStep> & { id: string }): StudioBeatStep {
  return {
    id: input.id,
    active: input.active ?? false,
    lengthTicks: Math.max(1, Math.round(input.lengthTicks ?? 120)),
    subdivision: Math.max(1, Math.round(input.subdivision ?? 16)),
    triplet: input.triplet ?? false,
    flamTicks: Math.max(0, Math.round(input.flamTicks ?? 0)),
    ratchet: Math.max(1, Math.min(8, Math.round(input.ratchet ?? 1))),
    probability: Math.max(0, Math.min(1, input.probability ?? 1)),
    velocity: Math.max(.01, Math.min(1, input.velocity ?? .8)),
    microtimingTicks: Math.round(input.microtimingTicks ?? 0),
  };
}

export function expandBeatStepEvents(step: StudioBeatStep, baseTick: number, random: () => number = Math.random) {
  if (!step.active || random() > step.probability) return [];
  const start = Math.max(0, Math.round(baseTick + step.microtimingTicks));
  const effectiveLength = step.triplet ? Math.round(step.lengthTicks * 2 / 3) : step.lengthTicks;
  const interval = effectiveLength / step.ratchet;
  const events: Array<{ tick: number; velocity: number; kind: "main" | "flam" }> = [{ tick: start, velocity: step.velocity, kind: "main" }];
  if (step.flamTicks > 0) events.push({ tick: start + step.flamTicks, velocity: Number((step.velocity * .72).toFixed(4)), kind: "flam" as const });
  for (let hit = 1; hit < step.ratchet; hit += 1) events.push({ tick: Math.round(start + interval * hit), velocity: step.velocity, kind: "main" as const });
  return events.sort((left, right) => left.tick - right.tick);
}
