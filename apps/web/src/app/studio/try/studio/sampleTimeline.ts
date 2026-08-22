export function secondsToFrames(seconds: number, sampleRate: number) {
  return Math.max(0, Math.round((Number.isFinite(seconds) ? seconds : 0) * Math.max(1, sampleRate)));
}

export function framesToSeconds(frames: number, sampleRate: number) {
  return Math.max(0, Math.round(frames)) / Math.max(1, sampleRate);
}

export function normalizeFrameRange(range: { startFrame: number; endFrame: number }) {
  const startFrame = Math.max(0, Math.round(Math.min(range.startFrame, range.endFrame)));
  const endFrame = Math.max(startFrame, Math.round(Math.max(range.startFrame, range.endFrame)));
  return { startFrame, endFrame, lengthFrames: endFrame - startFrame };
}

export function convertFrameRate(frames: number, fromSampleRate: number, toSampleRate: number) {
  return secondsToFrames(framesToSeconds(frames, fromSampleRate), toSampleRate);
}

export function framesToPixels(frames: number, sampleRate: number, pixelsPerSecond: number) {
  return framesToSeconds(frames, sampleRate) * Math.max(0, pixelsPerSecond);
}

export function pixelsToFrames(pixels: number, sampleRate: number, pixelsPerSecond: number) {
  return secondsToFrames(Math.max(0, pixels) / Math.max(Number.EPSILON, pixelsPerSecond), sampleRate);
}

export function snapFrame(frame: number, gridFrames: number, enabled = true) {
  const safe = Math.max(0, Math.round(frame));
  const grid = Math.max(1, Math.round(gridFrames));
  return enabled ? Math.round(safe / grid) * grid : safe;
}
