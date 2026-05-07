/**
 * PCM WAV encoder for AudioBuffer → Blob.
 *
 * Supports 16-bit or 24-bit integer PCM. 24-bit is preferred for final
 * mix export to preserve detail and headroom in downstream mastering.
 */

export interface WavEncodeOptions {
  bitsPerSample?: 16 | 24;
  /**
   * Adds triangular probability density dither prior to quantization.
   * Recommended for final export to reduce low-level quantization distortion.
   */
  dither?: boolean;
}

export function audioBufferToWav(
  buffer: AudioBuffer,
  options: WavEncodeOptions = {},
): Blob {
  const bitsPerSample = options.bitsPerSample ?? 16;
  const dither = options.dither ?? false;
  const numChannels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  // 44-byte header + bytes per sample × frames × channels.
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataLen = numFrames * blockAlign;
  const arrayBuf = new ArrayBuffer(44 + dataLen);
  const view = new DataView(arrayBuf);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLen, true);
  writeString(view, 8, "WAVE");
  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // format = PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true); // bits per sample
  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataLen, true);

  // Interleave + clamp to int16.
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }
  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      // Hard clamp prevents wrap-around on overdriven mixes.
      let sample = Math.max(-1, Math.min(1, channels[c]?.[i] ?? 0));
      if (dither) {
        // TPDF dither in roughly one LSB peak-to-peak.
        const lsb = bitsPerSample === 24 ? 1 / 0x7fffff : 1 / 0x7fff;
        sample += (Math.random() - Math.random()) * lsb;
        sample = Math.max(-1, Math.min(1, sample));
      }

      if (bitsPerSample === 24) {
        const int24 = Math.round(sample * 0x7fffff);
        const clamped = Math.max(-0x800000, Math.min(0x7fffff, int24));
        const asUnsigned = clamped < 0 ? clamped + 0x1000000 : clamped;
        view.setUint8(offset, asUnsigned & 0xff);
        view.setUint8(offset + 1, (asUnsigned >> 8) & 0xff);
        view.setUint8(offset + 2, (asUnsigned >> 16) & 0xff);
        offset += 3;
      } else {
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
  }

  return new Blob([arrayBuf], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
