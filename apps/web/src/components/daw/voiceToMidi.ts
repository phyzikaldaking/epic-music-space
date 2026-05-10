/**
 * Voice-to-MIDI: convert sung audio into a MIDI clip.
 *
 * Pipeline:
 *   1. Mix to mono (caller does this).
 *   2. Slide an analysis window across the audio (~25 ms hop).
 *   3. For each window, run autocorrelation-with-difference (a YIN-lite
 *      that doesn't need a full library) to estimate the fundamental
 *      frequency.
 *   4. Convert each frame's f0 to a MIDI note number.
 *   5. Quantize neighboring frames into note runs — combine consecutive
 *      frames with the same note, drop runs shorter than ~50ms.
 *   6. Emit MIDI notes with start/duration in beats (caller passes BPM).
 *
 * Honest caveats: works on a clean solo voice with one note at a time.
 * Polyphony, heavy vibrato, harsh sibilance, and noisy mics will throw
 * off octave estimates. Promoted as a starting point — the user is
 * expected to clean up the result in the piano roll.
 *
 * Why not CREPE-tiny: would require shipping a model file (~10 MB) and
 * building a worker harness around tfjs. Sized as a follow-up if
 * accuracy turns out to matter.
 */

export interface PitchedFrame {
  /** Estimated fundamental in Hz, or null if unvoiced/too noisy. */
  freq: number | null;
  /** RMS of this frame — used as velocity proxy. */
  rms: number;
  /** Frame center time in seconds. */
  timeSec: number;
}

export interface MidiNoteOut {
  note: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
}

/** YIN-style fundamental estimator. Returns Hz or null when the window
 *  is unvoiced (low energy) or has no clear minimum. */
function estimatePitchYin(
  samples: Float32Array,
  start: number,
  size: number,
  sampleRate: number,
  minHz: number = 70,
  maxHz: number = 1100,
): number | null {
  // RMS gate — silence/whisper produces no usable estimate.
  let rms = 0;
  for (let i = 0; i < size; i++) {
    const s = samples[start + i] ?? 0;
    rms += s * s;
  }
  rms = Math.sqrt(rms / size);
  if (rms < 0.005) return null;

  const minTau = Math.floor(sampleRate / maxHz);
  const maxTau = Math.min(size - 1, Math.ceil(sampleRate / minHz));

  // Difference function d[tau].
  const yin = new Float32Array(maxTau + 1);
  for (let tau = minTau; tau <= maxTau; tau++) {
    let sum = 0;
    for (let i = 0; i < size - maxTau; i++) {
      const a = samples[start + i] ?? 0;
      const b = samples[start + i + tau] ?? 0;
      const diff = a - b;
      sum += diff * diff;
    }
    yin[tau] = sum;
  }

  // Cumulative-mean-normalized difference.
  let runningSum = 0;
  yin[0] = 1;
  for (let tau = 1; tau <= maxTau; tau++) {
    runningSum += yin[tau] ?? 0;
    yin[tau] = runningSum > 0 ? ((yin[tau] ?? 0) * tau) / runningSum : 1;
  }

  // Absolute-threshold step. Pick the first tau below threshold.
  const threshold = 0.15;
  let chosenTau = -1;
  let chosenValue = 1;
  for (let tau = minTau; tau <= maxTau; tau++) {
    const v = yin[tau] ?? 1;
    if (v < threshold) {
      // Walk forward while the function still descends.
      while (tau + 1 <= maxTau && (yin[tau + 1] ?? 1) < v) tau++;
      chosenTau = tau;
      chosenValue = yin[tau] ?? 1;
      break;
    }
  }
  if (chosenTau < 0) return null;

  // Octave-reinforcement check (#5). YIN's first-below-threshold rule
  // can lock onto a subharmonic — i.e. tau is 2× or 3× the true period.
  // For a clean voice the YIN value at tau/2 (one octave higher) is also
  // low. If tau/2 is meaningfully better than chosenTau, the higher
  // candidate is the true fundamental and we just rejected an octave
  // drop. We use a stricter sub-threshold (chosenValue * 1.2) so harmless
  // local minima don't cause spurious octave-up jumps.
  for (const divisor of [2, 3]) {
    const candidate = Math.round(chosenTau / divisor);
    if (candidate < minTau) continue;
    const candidateValue = yin[candidate] ?? 1;
    if (candidateValue < threshold && candidateValue < chosenValue * 1.2) {
      chosenTau = candidate;
      chosenValue = candidateValue;
    }
  }

  // Confidence gate. If even the best YIN value is borderline (>0.12),
  // the frame is more noise than pitch; reject it so framesToMidi
  // doesn't emit a spurious note from a noisy boundary frame.
  if (chosenValue > 0.12) return null;

  // Parabolic interpolation around the chosen tau for sub-sample precision.
  const x0 = chosenTau - 1 >= minTau ? chosenTau - 1 : chosenTau;
  const x2 = chosenTau + 1 <= maxTau ? chosenTau + 1 : chosenTau;
  const s0 = yin[x0] ?? 1;
  const s1 = yin[chosenTau] ?? 1;
  const s2 = yin[x2] ?? 1;
  const denom = 2 * (s0 - 2 * s1 + s2);
  const refined =
    Math.abs(denom) < 1e-9 ? chosenTau : chosenTau + (s0 - s2) / denom;

  return sampleRate / Math.max(1, refined);
}

function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

/** Run pitch detection across the whole buffer at a fixed hop. */
export function trackPitches(
  samples: Float32Array,
  sampleRate: number,
  hopSec: number = 0.025,
  windowSec: number = 0.05,
): PitchedFrame[] {
  const hop = Math.max(64, Math.floor(hopSec * sampleRate));
  const win = Math.max(256, Math.floor(windowSec * sampleRate));
  const out: PitchedFrame[] = [];
  for (let start = 0; start + win < samples.length; start += hop) {
    let rms = 0;
    for (let i = 0; i < win; i++) {
      const s = samples[start + i] ?? 0;
      rms += s * s;
    }
    rms = Math.sqrt(rms / win);
    const freq = estimatePitchYin(samples, start, win, sampleRate);
    out.push({
      freq,
      rms,
      timeSec: (start + win / 2) / sampleRate,
    });
  }
  return out;
}

/** Quantize a stream of pitched frames into a MIDI note list, given BPM. */
export function framesToMidi(
  frames: PitchedFrame[],
  bpm: number,
  options: { minNoteSec?: number } = {},
): MidiNoteOut[] {
  const minNoteSec = options.minNoteSec ?? 0.06;
  const beatPerSec = bpm / 60;

  // First pass: convert frame freqs → MIDI numbers (or null).
  const midiSeq: Array<number | null> = frames.map((f) =>
    f.freq ? Math.round(freqToMidi(f.freq)) : null,
  );

  // Second pass: walk through and emit notes whenever the value changes.
  const notes: MidiNoteOut[] = [];
  let runStart = 0;
  let runValue: number | null = midiSeq[0] ?? null;
  for (let i = 1; i <= midiSeq.length; i++) {
    const v = i < midiSeq.length ? midiSeq[i] ?? null : null;
    if (v !== runValue) {
      if (runValue !== null) {
        const startSec = frames[runStart]?.timeSec ?? 0;
        const endSec = frames[i - 1]?.timeSec ?? startSec;
        const durSec = Math.max(0, endSec - startSec);
        if (durSec >= minNoteSec) {
          // Velocity from the run's average RMS, mapped 0..1.
          let totalRms = 0;
          let count = 0;
          for (let j = runStart; j < i; j++) {
            totalRms += frames[j]?.rms ?? 0;
            count++;
          }
          const meanRms = count > 0 ? totalRms / count : 0;
          const velocity = Math.max(0.25, Math.min(1, meanRms * 12));
          notes.push({
            note: runValue,
            startBeat: startSec * beatPerSec,
            durationBeats: durSec * beatPerSec,
            velocity,
          });
        }
      }
      runStart = i;
      runValue = v;
    }
  }

  // Third pass: octave-jump correction. Single-note jumps of exactly
  // 12 semitones up-then-back-down are usually octave errors from the
  // YIN minimum picker — pull them down.
  for (let i = 1; i < notes.length - 1; i++) {
    const prev = notes[i - 1];
    const cur = notes[i];
    const next = notes[i + 1];
    if (!prev || !cur || !next) continue;
    if (cur.note - prev.note === 12 && next.note - cur.note === -12) {
      cur.note -= 12;
    }
  }

  return notes;
}

/** Convenience: full pipeline. Returns the converted notes plus a
 *  confidence score (#22) — the fraction of voiced frames vs total —
 *  so the UI can warn the user when the input was too quiet or noisy
 *  to detect pitch reliably. */
export function audioToMidiNotes(
  monoSamples: Float32Array,
  sampleRate: number,
  bpm: number,
): { notes: MidiNoteOut[]; lengthBeats: number; confidence: number } {
  const frames = trackPitches(monoSamples, sampleRate);
  const notes = framesToMidi(frames, bpm);
  const beatPerSec = bpm / 60;
  const totalSec = monoSamples.length / sampleRate;
  const voiced = frames.reduce((acc, f) => acc + (f.freq ? 1 : 0), 0);
  const confidence = frames.length > 0 ? voiced / frames.length : 0;
  return {
    notes,
    lengthBeats: Math.max(4, Math.ceil(totalSec * beatPerSec)),
    confidence,
  };
}
