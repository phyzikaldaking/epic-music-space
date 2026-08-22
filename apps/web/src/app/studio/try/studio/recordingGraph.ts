export type MeterFrame = {
  peak: number;
  rms: number;
  peakDb: number;
  rmsDb: number;
  clipping: boolean;
  clipHeld: boolean;
  clipHoldUntil: number;
};

export type MonitoringPolicy = {
  gain: number;
  warning: string | null;
};

function round(value: number, places: number) {
  const power = 10 ** places;
  return Math.round(value * power) / power;
}

function toDb(value: number) {
  return value <= 0 ? -Infinity : round(20 * Math.log10(value), 2);
}

export function calculateMeterFrame(samples: Float32Array, nowMs: number, previousClipHoldUntil = 0): MeterFrame {
  let peak = 0;
  let squared = 0;
  for (const sample of samples) {
    const absolute = Math.abs(sample);
    peak = Math.max(peak, absolute);
    squared += sample * sample;
  }
  const rms = samples.length ? Math.sqrt(squared / samples.length) : 0;
  const clipping = peak >= .99;
  const clipHoldUntil = clipping ? nowMs + 2_000 : previousClipHoldUntil;
  return {
    peak: round(peak, 4),
    rms: round(rms, 4),
    peakDb: toDb(peak),
    rmsDb: toDb(rms),
    clipping,
    clipHeld: clipping || clipHoldUntil > nowMs,
    clipHoldUntil,
  };
}

export function resolveMonitoringPolicy(input: { enabled: boolean; headphonesConfirmed: boolean; gain: number }): MonitoringPolicy {
  if (!input.enabled) return { gain: 0, warning: null };
  return {
    gain: Math.max(0, Math.min(1, input.gain)),
    warning: input.headphonesConfirmed ? null : "Use headphones to prevent speaker feedback and echo.",
  };
}

export function createRecordingGraph(context: AudioContext, stream: MediaStream) {
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  const monitorGain = context.createGain();
  analyser.fftSize = 2048;
  monitorGain.gain.value = 0;
  source.connect(analyser);
  source.connect(monitorGain);
  monitorGain.connect(context.destination);

  return {
    analyser,
    monitorGain,
    setMonitoring(input: { enabled: boolean; headphonesConfirmed: boolean; gain: number }) {
      const policy = resolveMonitoringPolicy(input);
      monitorGain.gain.setTargetAtTime(policy.gain, context.currentTime, .01);
      return policy;
    },
    dispose() {
      source.disconnect();
      analyser.disconnect();
      monitorGain.disconnect();
    },
  };
}
