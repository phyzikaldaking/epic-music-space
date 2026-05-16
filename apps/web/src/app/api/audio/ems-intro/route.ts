import { NextResponse } from "next/server";

export const dynamic = "force-static";

const SAMPLE_RATE = 44100;
const DURATION_SEC = 3.2;

function clamp(value: number) {
  return Math.max(-1, Math.min(1, value));
}

function envelope(t: number, duration = DURATION_SEC) {
  const attack = Math.min(1, t / 0.08);
  const release = Math.min(1, (duration - t) / 0.55);
  return Math.max(0, Math.min(attack, release));
}

function bell(t: number, freq: number, decay: number, gain: number) {
  return Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * decay) * gain;
}

function synthSample(t: number) {
  const sweep = 48 + 34 * Math.sin(t * 1.6) + t * 90;
  const sub = Math.sin(2 * Math.PI * sweep * t) * 0.28;
  const logoChord =
    bell(Math.max(0, t - 0.34), 261.63, 2.8, 0.22) +
    bell(Math.max(0, t - 0.42), 329.63, 2.9, 0.18) +
    bell(Math.max(0, t - 0.50), 392.0, 3.1, 0.16) +
    bell(Math.max(0, t - 0.68), 523.25, 3.5, 0.13);
  const shimmer =
    Math.sin(2 * Math.PI * (1046.5 + Math.sin(t * 9) * 18) * t) * Math.exp(-Math.max(0, t - 0.48) * 2.2) * 0.055 +
    Math.sin(2 * Math.PI * 1567.98 * t) * Math.exp(-Math.max(0, t - 0.62) * 3.2) * 0.035;
  const hitTime = Math.max(0, t - 1.05);
  const impact = Math.sin(2 * Math.PI * 74 * hitTime) * Math.exp(-hitTime * 5.4) * 0.55;
  const air = (Math.random() * 2 - 1) * Math.exp(-Math.max(0, t - 1.0) * 8) * 0.025;
  const rise = Math.sin(2 * Math.PI * (220 + t * 340) * t) * Math.max(0, Math.min(1, t / 1.1)) * Math.exp(-Math.max(0, t - 1.15) * 2.8) * 0.08;
  return clamp((sub + logoChord + shimmer + impact + rise + air) * envelope(t));
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
}

function createWav() {
  const samples = Math.floor(SAMPLE_RATE * DURATION_SEC);
  const channels = 2;
  const bytesPerSample = 2;
  const dataSize = samples * channels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples; i += 1) {
    const t = i / SAMPLE_RATE;
    const sample = synthSample(t);
    const pan = Math.sin(t * 2.4) * 0.18;
    const left = clamp(sample * (1 - pan));
    const right = clamp(sample * (1 + pan));
    view.setInt16(offset, left * 0x7fff, true);
    view.setInt16(offset + 2, right * 0x7fff, true);
    offset += 4;
  }

  return Buffer.from(buffer);
}

export async function GET() {
  const wav = createWav();
  return new NextResponse(wav, {
    headers: {
      "Content-Type": "audio/wav",
      "Content-Length": String(wav.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Disposition": "inline; filename=ems-world-intro-stinger.wav",
    },
  });
}
