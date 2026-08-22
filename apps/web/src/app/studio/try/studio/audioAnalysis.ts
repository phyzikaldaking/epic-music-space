export type TempoAnalysis = { bpm: number | null; confidence: number; detected: boolean; projectBpm?: never };

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function analyzeTempoFromOnsets(onsetFrames: number[], sampleRate: number): TempoAnalysis {
  const ordered = [...new Set(onsetFrames.map((frame) => Math.max(0, Math.round(frame))))].sort((left, right) => left - right);
  const intervals = ordered.slice(1).map((frame, index) => frame - ordered[index]).filter((interval) => interval > 0);
  if (intervals.length < 2) return { bpm: null, confidence: 0, detected: false };
  const centralInterval = median(intervals);
  let bpm = 60 * Math.max(1, sampleRate) / centralInterval;
  while (bpm > 200) bpm /= 2;
  while (bpm < 50) bpm *= 2;
  bpm = Number(bpm.toFixed(1));
  const meanRelativeDeviation = intervals.reduce((total, interval) => total + Math.abs(interval - centralInterval) / centralInterval, 0) / intervals.length;
  const confidence = Number(Math.max(0, Math.min(1, 1 - meanRelativeDeviation * 2)).toFixed(3));
  return { bpm, confidence, detected: confidence >= .5 };
}

export function adoptAnalyzedTempo(currentBpm: number, analysis: TempoAnalysis) {
  const after = analysis.detected && analysis.bpm !== null ? analysis.bpm : currentBpm;
  return { label: "Adopt analyzed tempo", before: currentBpm, after, undo: currentBpm, confidence: analysis.confidence };
}

export type TransientMarker = { id: string; sourceId: string; frame: number; strength: number; edited: boolean };

export function detectTransientMarkers(peaks: number[], options: { sourceId: string; framesPerPeak: number; threshold?: number; minSpacingFrames?: number }) {
  const threshold = Math.max(0, Math.min(1, options.threshold ?? .55));
  const spacing = Math.max(0, Math.round(options.minSpacingFrames ?? options.framesPerPeak * 2));
  const markers: TransientMarker[] = [];
  let previousAbove = false;
  for (let index = 0; index < peaks.length; index += 1) {
    const strength = Math.max(0, Math.min(1, Math.abs(peaks[index] ?? 0)));
    const above = strength >= threshold;
    const frame = index * options.framesPerPeak;
    if (above && !previousAbove && (markers.length === 0 || frame - markers[markers.length - 1].frame >= spacing)) {
      markers.push({ id: `${options.sourceId}-transient-${frame}`, sourceId: options.sourceId, frame, strength, edited: false });
    }
    previousAbove = above;
  }
  return markers;
}

export function addTransient(markers: TransientMarker[], marker: Omit<TransientMarker, "edited"> & { edited?: boolean }) {
  return [...markers, { ...marker, frame: Math.max(0, Math.round(marker.frame)), edited: marker.edited ?? true }].sort((left, right) => left.frame - right.frame);
}

export function moveTransient(markers: TransientMarker[], id: string, frame: number) {
  return markers.map((marker) => marker.id === id ? { ...marker, frame: Math.max(0, Math.round(frame)), edited: true } : marker).sort((left, right) => left.frame - right.frame);
}

export function removeTransient(markers: TransientMarker[], id: string) {
  return markers.filter((marker) => marker.id !== id);
}

export function buildTransientSlices(markers: TransientMarker[], durationFrames: number) {
  const end = Math.max(0, Math.round(durationFrames));
  const boundaries = [0, ...new Set(markers.map((marker) => Math.max(0, Math.min(end, Math.round(marker.frame))))), end].sort((left, right) => left - right);
  return boundaries.slice(0, -1).flatMap((startFrame, index) => boundaries[index + 1] > startFrame ? [{ startFrame, endFrame: boundaries[index + 1] }] : []);
}
