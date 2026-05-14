type SequencerPattern = {
  trackId: string;
  steps: boolean[];
  velocity?: number[];
};

type ScheduleRequest = {
  type: "schedule";
  bpm: number;
  bar: number;
  lookaheadBeats: number;
  patterns: SequencerPattern[];
};

type WorkerMessage = ScheduleRequest | { type: "ping" };

function buildEvents(message: ScheduleRequest) {
  const stepsPerBar = 16;
  const beatSeconds = 60 / Math.max(1, message.bpm);
  const stepSeconds = beatSeconds / 4;
  const startStep = Math.max(0, (message.bar - 1) * stepsPerBar);
  const lookaheadSteps = Math.max(1, Math.ceil(message.lookaheadBeats * 4));

  return message.patterns.flatMap((pattern) => {
    if (!pattern.steps.length) return [];
    const events: Array<{ trackId: string; step: number; offsetSeconds: number; velocity: number }> = [];
    for (let index = 0; index < lookaheadSteps; index += 1) {
      const absoluteStep = startStep + index;
      const patternStep = absoluteStep % pattern.steps.length;
      if (pattern.steps[patternStep]) {
        events.push({
          trackId: pattern.trackId,
          step: absoluteStep,
          offsetSeconds: index * stepSeconds,
          velocity: pattern.velocity?.[patternStep] ?? 0.9,
        });
      }
    }
    return events;
  });
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  if (event.data.type === "ping") {
    self.postMessage({ type: "pong" });
    return;
  }

  if (event.data.type === "schedule") {
    self.postMessage({ type: "scheduled", events: buildEvents(event.data) });
  }
};

export {};
