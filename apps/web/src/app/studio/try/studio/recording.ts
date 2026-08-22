export type RecordingDeviceSelection = {
  inputDeviceId: string;
  outputDeviceId?: string;
  channelCount: 1 | 2;
};

export type RecordingLatencyProfile = {
  inputMs: number;
  outputMs: number;
  baseMs: number;
  measuredAt: string;
};

export type RecordingTake = Readonly<{
  id: string;
  trackId: string;
  laneId: string;
  pass: number;
  sourceId: string;
  durationSec: number;
  startedAtSec: number;
}>;

export type TakeLane = {
  id: string;
  trackId: string;
  takes: RecordingTake[];
  activeTakeId?: string;
};

export type CompSegment = Readonly<{
  takeId: string;
  sourceStartSec: number;
  timelineStartSec: number;
  durationSec: number;
}>;

export type CompMap = Readonly<{
  trackId: string;
  durationSec: number;
  segments: readonly CompSegment[];
}>;

function finiteNonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function calculateRecordingAlignment(profile: RecordingLatencyProfile, manualOffsetMs = 0, maximumMs = 250) {
  const measuredMs = finiteNonNegative(profile.inputMs) + finiteNonNegative(profile.outputMs) + finiteNonNegative(profile.baseMs);
  const calibratedMs = measuredMs + (Number.isFinite(manualOffsetMs) ? manualOffsetMs : 0);
  return Number((Math.max(-maximumMs, Math.min(maximumMs, calibratedMs)) / 1000).toFixed(6));
}

export function validatePunchRange(range: { inSec: number; outSec: number }): { ok: true } | { ok: false; reason: string } {
  if (range.inSec < 0 || range.outSec < 0) return { ok: false, reason: "Punch points cannot be negative." };
  if (range.outSec <= range.inSec) return { ok: false, reason: "Punch out must be after punch in." };
  if (range.outSec - range.inSec < .01) return { ok: false, reason: "Punch range must be at least 10 ms." };
  return { ok: true };
}

export function createRecordingTake(input: Omit<RecordingTake, "id">): RecordingTake {
  if (!input.sourceId) throw new Error("A recorded take requires an immutable source ID.");
  if (input.pass < 1 || !Number.isInteger(input.pass)) throw new Error("Recording pass must be a positive integer.");
  return Object.freeze({ ...input, id: `${input.laneId}:pass:${input.pass}` });
}

export function appendTakeToLane(lane: TakeLane | undefined, take: RecordingTake): TakeLane {
  if (lane && (lane.id !== take.laneId || lane.trackId !== take.trackId)) throw new Error("Take does not belong to this lane.");
  return {
    id: take.laneId,
    trackId: take.trackId,
    takes: [...(lane?.takes ?? []), take],
    activeTakeId: take.id,
  };
}

export function activateTakeInLane(lane: TakeLane, takeId: string): TakeLane {
  if (!lane.takes.some((take) => take.id === takeId)) throw new Error("Take does not exist in this lane.");
  return { ...lane, activeTakeId: takeId };
}

export function createCompMap(trackId: string, segments: CompSegment[]): CompMap {
  const ordered = segments
    .map((segment) => Object.freeze({ ...segment }))
    .sort((left, right) => left.timelineStartSec - right.timelineStartSec);

  ordered.forEach((segment, index) => {
    if (segment.durationSec <= 0 || segment.sourceStartSec < 0 || segment.timelineStartSec < 0) throw new Error("Comp segments require non-negative positions and positive duration.");
    const previous = ordered[index - 1];
    if (previous && previous.timelineStartSec + previous.durationSec > segment.timelineStartSec) throw new Error("Comp segments cannot overlap.");
  });

  const durationSec = ordered.reduce((duration, segment) => Math.max(duration, segment.timelineStartSec + segment.durationSec), 0);
  return Object.freeze({ trackId, durationSec, segments: Object.freeze(ordered) });
}
