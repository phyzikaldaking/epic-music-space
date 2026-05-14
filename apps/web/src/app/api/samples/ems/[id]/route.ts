import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAMPLE_RATE = 44_100;
const TWO_PI = Math.PI * 2;

type SampleKind = "kick" | "snare" | "clap" | "hat" | "openHat" | "bass808" | "perc" | "rim" | "crash" | "melody" | "vocal";

function kindFromId(id: string): SampleKind {
  if (id.includes("kick")) return "kick";
  if (id.includes("snare")) return "snare";
  if (id.includes("clap")) return "clap";
  if (id.includes("hat_open")) return "openHat";
  if (id.includes("hat_closed")) return "hat";
  if (id.includes("808")) return "bass808";
  if (id.includes("perc")) return "perc";
  if (id.includes("rim")) return "rim";
  if (id.includes("fx")) return "crash";
  if (id.includes("melody")) return "melody";
  if (id.includes("vocal")) return "vocal";
  return "perc";
}

function seeded(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function noise(seed: number): () => number {
  let s = Math.floor(seed * 2147483647) || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s / 2147483647) * 2 - 1;
  };
}

function env(t: number, decay = 8): number {
  return Math.exp(-t * decay);
}

function synth(id: string): Float32Array {
  const kind = kindFromId(id);
  const seed = seeded(id);
  const n = noise(seed);
  const duration = kind === "bass808" ? 1.35 : kind === "openHat" || kind === "crash" ? 0.85 : kind === "melody" || kind === "vocal" ? 0.75 : 0.38;
  const length = Math.floor(SAMPLE_RATE * duration);
  const out = new Float32Array(length);

  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    let v = 0;
    if (kind === "kick") {
      const f = 48 + 92 * Math.exp(-t * 35) + seed * 8;
      v = Math.sin(TWO_PI * f * t) * env(t, 12) + Math.sin(TWO_PI * 38 * t) * env(t, 5) * 0.4;
      if (t < 0.018) v += n() * (1 - t / 0.018) * 0.55;
    } else if (kind === "bass808") {
      const f = 42 + seed * 16;
      v = Math.sin(TWO_PI * f * t) * env(t, 2.4);
      v = Math.tanh(v * 3.2) * 0.85;
    } else if (kind === "snare") {
      v = n() * env(t, 18) * 0.85 + Math.sin(TWO_PI * (185 + seed * 80) * t) * env(t, 16) * 0.45;
    } else if (kind === "clap") {
      const burst = (Math.exp(-((t - 0.018) ** 2) / 0.00004) + Math.exp(-((t - 0.038) ** 2) / 0.00006) + Math.exp(-((t - 0.067) ** 2) / 0.00009));
      v = n() * burst * 0.8 + n() * env(Math.max(0, t - 0.06), 12) * 0.25;
    } else if (kind === "hat") {
      v = n() * env(t, 55) * (Math.sin(TWO_PI * 9000 * t) > 0 ? 1 : -1);
    } else if (kind === "openHat") {
      v = n() * env(t, 8) * (Math.sin(TWO_PI * 7500 * t) > 0 ? 1 : -1);
    } else if (kind === "rim") {
      v = Math.sin(TWO_PI * (780 + seed * 160) * t) * env(t, 35) + Math.sin(TWO_PI * 1800 * t) * env(t, 45) * 0.3;
    } else if (kind === "perc") {
      v = (Math.sin(TWO_PI * (320 + seed * 900) * t) + n() * 0.25) * env(t, 22);
    } else if (kind === "crash") {
      v = n() * env(t, 4.2) * (0.35 + 0.65 * Math.sin(TWO_PI * 5200 * t));
    } else if (kind === "melody") {
      const f = 220 + Math.round(seed * 12) * 18;
      v = (Math.sin(TWO_PI * f * t) + Math.sin(TWO_PI * f * 1.5 * t) * 0.35) * env(t, 3.2);
    } else if (kind === "vocal") {
      const f = 190 + seed * 90;
      v = (Math.sin(TWO_PI * f * t) + Math.sin(TWO_PI * (f * 2.03) * t) * 0.35) * env(t, 5.5);
      v *= 0.5 + 0.5 * Math.sin(TWO_PI * 6 * t);
    }
    out[i] = Math.max(-0.98, Math.min(0.98, v * 0.78));
  }
  return out;
}

function wav(samples: Float32Array): Buffer {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  let o = 0;
  buffer.write("RIFF", o); o += 4;
  buffer.writeUInt32LE(36 + dataSize, o); o += 4;
  buffer.write("WAVE", o); o += 4;
  buffer.write("fmt ", o); o += 4;
  buffer.writeUInt32LE(16, o); o += 4;
  buffer.writeUInt16LE(1, o); o += 2;
  buffer.writeUInt16LE(1, o); o += 2;
  buffer.writeUInt32LE(SAMPLE_RATE, o); o += 4;
  buffer.writeUInt32LE(SAMPLE_RATE * 2, o); o += 4;
  buffer.writeUInt16LE(2, o); o += 2;
  buffer.writeUInt16LE(16, o); o += 2;
  buffer.write("data", o); o += 4;
  buffer.writeUInt32LE(dataSize, o); o += 4;
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    buffer.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7fff, o);
    o += 2;
  }
  return buffer;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^ems_[a-z0-9_]+$/i.test(id)) return new Response("Invalid sample id", { status: 400 });
  const body = wav(synth(id));
  return new Response(body, {
    headers: {
      "Content-Type": "audio/wav",
      "Content-Disposition": `inline; filename="${id}.wav"`,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-EMS-License": "EMS-owned procedurally generated original WAV asset",
    },
  });
}
