"use client";

import { useState } from "react";

type Progress = {
  status: "idle" | "encoding" | "complete" | "error";
  message: string;
  percent: number;
};

type LameModule = {
  Mp3Encoder?: new (channels: number, sampleRate: number, kbps: number) => {
    encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array;
    flush(): Int8Array;
  };
  default?: {
    Mp3Encoder?: new (channels: number, sampleRate: number, kbps: number) => {
      encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array;
      flush(): Int8Array;
    };
  };
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "studio-export";
}

function floatTo16Bit(input: Float32Array, start: number, length: number) {
  const output = new Int16Array(length);
  for (let i = 0; i < length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[start + i] ?? 0));
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function mp3ChunkToArrayBuffer(chunk: Int8Array) {
  const copy = new Uint8Array(chunk.byteLength);
  copy.set(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
  return copy.buffer;
}

async function decodeAudioFile(file: File) {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) throw new Error("This browser cannot decode audio files.");
  const ctx = new AudioCtx();
  try {
    return await ctx.decodeAudioData((await file.arrayBuffer()).slice(0));
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

async function encodeMp3(buffer: AudioBuffer, kbps: number, onProgress: (value: Progress) => void) {
  const lame = await import("lamejs") as LameModule;
  const Encoder = lame.Mp3Encoder ?? lame.default?.Mp3Encoder;
  if (!Encoder) throw new Error("MP3 encoder failed to load.");

  const channels = Math.min(2, buffer.numberOfChannels || 1);
  const encoder = new Encoder(channels, buffer.sampleRate, kbps);
  const left = buffer.getChannelData(0);
  const right = channels > 1 ? buffer.getChannelData(1) : undefined;
  const blockSize = 1152;
  const chunks: ArrayBuffer[] = [];

  for (let start = 0; start < buffer.length; start += blockSize) {
    const length = Math.min(blockSize, buffer.length - start);
    const leftChunk = floatTo16Bit(left, start, length);
    const rightChunk = right ? floatTo16Bit(right, start, length) : undefined;
    const encoded = channels > 1 && rightChunk ? encoder.encodeBuffer(leftChunk, rightChunk) : encoder.encodeBuffer(leftChunk);
    if (encoded.length) chunks.push(mp3ChunkToArrayBuffer(encoded));
    if (start % (blockSize * 80) === 0) {
      onProgress({ status: "encoding", message: "Encoding MP3 frames...", percent: Math.min(95, Math.round((start / buffer.length) * 90) + 5) });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  const flushed = encoder.flush();
  if (flushed.length) chunks.push(mp3ChunkToArrayBuffer(flushed));
  return new Blob(chunks, { type: "audio/mpeg" });
}

export default function StudioMp3EncoderPanel() {
  const [kbps, setKbps] = useState(192);
  const [progress, setProgress] = useState<Progress>({ status: "idle", message: "Choose a WAV or audio render to encode as MP3.", percent: 0 });

  async function handleFiles(files: FileList | File[]) {
    const file = Array.from(files)[0];
    if (!file) return;
    setProgress({ status: "encoding", message: `Decoding ${file.name}...`, percent: 5 });
    try {
      const buffer = await decodeAudioFile(file);
      setProgress({ status: "encoding", message: "Starting MP3 encoder...", percent: 12 });
      const mp3 = await encodeMp3(buffer, kbps, setProgress);
      downloadBlob(mp3, `${slug(file.name.replace(/\.[a-z0-9]+$/i, ""))}-demo-${kbps}kbps.mp3`);
      setProgress({ status: "complete", message: "MP3 demo downloaded.", percent: 100 });
    } catch (err) {
      setProgress({ status: "error", message: err instanceof Error ? err.message : "MP3 encoding failed.", percent: 0 });
    }
  }

  return (
    <main className="h-dvh overflow-auto bg-[#101319] px-6 py-16 text-white">
      <section className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-[#171b22] p-6 shadow-[0_24px_80px_rgba(0,0,0,.45)]">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-yellow-200">Browser MP3 encoder</p>
        <h2 className="mt-2 text-3xl font-black uppercase tracking-[0.12em] text-white">MP3 demo export</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
          This is the real browser MP3 path using lamejs. Render a WAV master from the DAW Export tab, then drop that WAV here to produce a downloadable MP3 demo without faking the export.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-[1fr_220px]">
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void handleFiles(event.dataTransfer.files);
            }}
            className="rounded-3xl border border-dashed border-yellow-300/40 bg-yellow-300/5 p-8 text-center"
          >
            <p className="text-lg font-black uppercase tracking-widest text-yellow-100">Drop WAV/audio here</p>
            <p className="mt-2 text-sm text-white/50">or choose the WAV master rendered from the DAW Export tab</p>
            <label className="mt-5 inline-flex cursor-pointer rounded-full bg-yellow-300 px-6 py-3 text-xs font-black uppercase tracking-widest text-black hover:bg-yellow-200">
              Choose audio
              <input
                type="file"
                accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.webm,.flac,.aif,.aiff,.mp4"
                className="sr-only"
                onChange={(event) => event.target.files && void handleFiles(event.target.files)}
              />
            </label>
          </div>

          <aside className="rounded-3xl border border-white/10 bg-black/35 p-5">
            <label className="block text-xs font-black uppercase tracking-widest text-white/50">
              Bitrate
              <select
                value={kbps}
                onChange={(event) => setKbps(Number(event.target.value))}
                className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3 font-mono text-sm text-yellow-100 outline-none focus:border-yellow-300"
              >
                <option value={128}>128 kbps demo</option>
                <option value={192}>192 kbps balanced</option>
                <option value={256}>256 kbps high</option>
                <option value={320}>320 kbps max</option>
              </select>
            </label>
            <div className="mt-5 rounded-2xl border border-white/10 bg-black p-4">
              <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/45">
                <span>{progress.message}</span>
                <span>{progress.percent}%</span>
              </div>
              <div className="mt-2 h-3 bg-black">
                <div
                  className={cn("h-full", progress.status === "error" ? "bg-red-500" : progress.status === "complete" ? "bg-green-400" : "bg-yellow-300")}
                  style={{ width: `${Math.max(0, Math.min(100, progress.percent))}%` }}
                />
              </div>
            </div>
          </aside>
        </div>

        <div className="mt-6 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm leading-6 text-cyan-50">
          <b className="block uppercase tracking-widest text-cyan-200">Next integration step</b>
          The encoder is real. The cleaner final UX is to call this same encoder directly from the DAW Export tab after the browser mix renderer finishes.
        </div>
      </section>
    </main>
  );
}
