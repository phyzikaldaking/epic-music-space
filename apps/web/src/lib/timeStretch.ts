// Time-stretch a sample buffer (#18). Overlap-add resampling at a
// different hop than analysis. Keeps pitch constant; changes length.
//
// Algorithm: split the input into ~50ms frames windowed with a Hann
// envelope. Read frames at hop = HOP_SAMPLES (input hop) but write
// them at hop = HOP_SAMPLES / stretchFactor (output hop). The window
// envelope handles seam-hiding via constant-overlap-add. Not as
// transparent as a proper phase-vocoder for harmonic content, but
// excellent for drum / vocal loops where transient preservation
// matters more than tonal purity. Falls back to playbackRate for
// extreme ratios (<0.5 or >2.0).
//
// Used by the engine's lane sample machinery: when a loop has a
// known source BPM and the project BPM changes, we stretch the
// buffer instead of detuning it via playbackRate (which would
// pitch-shift a sample meant for one tempo into a different key).

const FRAME_SAMPLES = 2048; // ~43ms at 48k — short enough for transients
const HOP_SAMPLES = 512; // 75% overlap

/** Hann window, cached for the standard frame size. */
function hannWindow(): Float32Array {
  const w = new Float32Array(FRAME_SAMPLES);
  for (let i = 0; i < FRAME_SAMPLES; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FRAME_SAMPLES - 1)));
  }
  return w;
}

const HANN = hannWindow();

/** Stretch `buffer` by `stretchFactor` (>1 = longer, <1 = shorter).
 *  Returns a new AudioBuffer. Pitch is preserved. */
export function timeStretchBuffer(
  buffer: AudioBuffer,
  ctx: BaseAudioContext,
  stretchFactor: number,
): AudioBuffer {
  // Guard rails — at extreme ratios the OLA artifacts dominate, and
  // playbackRate (which is essentially free) sounds better even with
  // its pitch-shift side effect. Caller can opt back into stretch
  // by clamping the factor before calling.
  const factor = Math.max(0.5, Math.min(2.0, stretchFactor));
  if (Math.abs(factor - 1) < 0.005) return buffer; // no-op

  const sampleRate = buffer.sampleRate;
  const channels = buffer.numberOfChannels;
  const inLen = buffer.length;
  const outLen = Math.floor(inLen * factor);
  const out = ctx.createBuffer(channels, outLen, sampleRate);

  // Input is sampled at HOP_SAMPLES; output written at outputHop.
  // factor > 1 ⇒ outputHop > HOP_SAMPLES ⇒ frames spread further
  // apart on the output, lengthening the sample.
  const outputHop = HOP_SAMPLES * factor;

  for (let ch = 0; ch < channels; ch++) {
    const input = buffer.getChannelData(ch);
    const output = out.getChannelData(ch);
    // Normalization track — counts how many overlapping windows hit
    // each output sample so we can divide back to unity gain.
    const norm = new Float32Array(outLen);

    let outPos = 0;
    let inPos = 0;
    while (inPos + FRAME_SAMPLES <= inLen) {
      const writeStart = Math.floor(outPos);
      const limit = Math.min(FRAME_SAMPLES, outLen - writeStart);
      for (let i = 0; i < limit; i++) {
        const w = HANN[i] ?? 0;
        output[writeStart + i] = (output[writeStart + i] ?? 0) + (input[inPos + i] ?? 0) * w;
        norm[writeStart + i] = (norm[writeStart + i] ?? 0) + w;
      }
      inPos += HOP_SAMPLES;
      outPos += outputHop;
    }
    // Normalize. Where overlap was light (start/end), avoid divide-by
    // -near-zero amplifying noise.
    for (let i = 0; i < outLen; i++) {
      const n = norm[i] ?? 0;
      if (n > 0.001) {
        output[i] = (output[i] ?? 0) / n;
      }
    }
  }

  return out;
}
