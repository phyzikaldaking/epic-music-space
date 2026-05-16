// Voice-to-MIDI Web Worker — runs YIN pitch detection off the main audio thread.
// Receives: { type: "analyze", samples: Float32Array, sampleRate: number, bpm?: number }
// Returns:  { type: "result", notes: MidiNote[] } | { type: "error", message: string }

function yinPitch(buffer, sampleRate) {
  const halfSize = Math.floor(buffer.length / 2);
  const yinBuf = new Float32Array(halfSize);
  const threshold = 0.15;
  for (let t = 0; t < halfSize; t++) {
    yinBuf[t] = 0;
    for (let j = 0; j < halfSize; j++) {
      const d = buffer[j] - buffer[j + t];
      yinBuf[t] += d * d;
    }
  }
  yinBuf[0] = 1;
  let runningSum = 0;
  for (let t = 1; t < halfSize; t++) {
    runningSum += yinBuf[t];
    yinBuf[t] *= t / runningSum;
  }
  let tau = -1;
  for (let t = 2; t < halfSize; t++) {
    if (yinBuf[t] < threshold) {
      while (t + 1 < halfSize && yinBuf[t + 1] < yinBuf[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau === -1) return -1;
  const x0 = tau < 1 ? tau : tau - 1;
  const x2 = tau + 1 < halfSize ? tau + 1 : tau;
  let bTau;
  if (x0 === tau) bTau = yinBuf[tau] <= yinBuf[x2] ? tau : x2;
  else if (x2 === tau) bTau = yinBuf[tau] <= yinBuf[x0] ? tau : x0;
  else { const s0 = yinBuf[x0], s2 = yinBuf[x2]; bTau = tau + (s2 - s0) / (2 * (2 * yinBuf[tau] - s2 - s0)); }
  return sampleRate / bTau;
}

function freqToMidi(freq) { return freq > 0 ? Math.round(69 + 12 * Math.log2(freq / 440)) : -1; }
function rms(buf, s, e) { let sum = 0; for (let i = s; i < e; i++) sum += buf[i] * buf[i]; return Math.sqrt(sum / (e - s)); }

self.onmessage = function(e) {
  const { type, samples, sampleRate, bpm = 120 } = e.data;
  if (type !== "analyze") return;
  try {
    const pcm = new Float32Array(samples);
    const frameSize = Math.round(sampleRate * 0.05);
    const hopSize = Math.round(sampleRate * 0.025);
    const bps = bpm / 60;
    const silThresh = 0.01;
    const frames = [];
    for (let i = 0; i + frameSize <= pcm.length; i += hopSize) {
      const r2 = rms(pcm, i, i + frameSize);
      const freq = r2 > silThresh ? yinPitch(pcm.slice(i, i + frameSize), sampleRate) : -1;
      frames.push({ freq, rms: r2, timeSec: i / sampleRate });
    }
    const notes = [];
    let noteStart = -1, currentNote = -1, maxRms = 0;
    for (let i = 0; i <= frames.length; i++) {
      const f = frames[i];
      const mn = f ? freqToMidi(f.freq) : -1;
      if (mn !== currentNote) {
        if (currentNote > 0 && noteStart >= 0) {
          const dur = (frames[i - 1]?.timeSec ?? frames[noteStart].timeSec) - frames[noteStart].timeSec;
          if (dur > 0.05) notes.push({ note: currentNote, startBeat: frames[noteStart].timeSec * bps, durationBeats: dur * bps, velocity: Math.min(1, maxRms * 8) });
        }
        currentNote = mn; noteStart = i; maxRms = 0;
      }
      if (f) maxRms = Math.max(maxRms, f.rms);
    }
    self.postMessage({ type: "result", notes });
  } catch(err) {
    self.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
