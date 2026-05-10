"use client";

import { analyseMonoSamples, type MasteringMatch } from "./matcheringCore";

export type { MasteringMatch } from "./matcheringCore";

/** Mix an AudioBuffer down to mono Float32 (allocating a fresh array
 *  so the worker can transfer ownership without copying). */
function mixToMonoFloat32(buffer: AudioBuffer): Float32Array {
  const len = buffer.length;
  const channels = buffer.numberOfChannels;
  const mono = new Float32Array(len);
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) mono[i] += data[i] / channels;
  }
  return mono;
}

/** Decode a reference blob and analyse it for EQ deltas + loudness
 *  targets. Synchronous compute runs on the main thread — fine for
 *  small inputs, but for >5 second clips prefer analyseReferenceAsync
 *  which offloads to a Web Worker (#14). */
export async function analyseReference(
  ctx: AudioContext,
  blob: Blob,
): Promise<MasteringMatch | null> {
  try {
    const arr = await blob.arrayBuffer();
    const buffer = await ctx.decodeAudioData(arr.slice(0));
    return analyseBuffer(buffer);
  } catch {
    return null;
  }
}

/** Synchronous analyse — kept for callers that already had it. */
export function analyseBuffer(buffer: AudioBuffer): MasteringMatch {
  const mono = mixToMonoFloat32(buffer);
  return analyseMonoSamples(mono, buffer.sampleRate);
}

/** Web Worker variant of analyseReference. Decodes on the main thread
 *  (AudioContext only lives there), then transfers the mono buffer to
 *  the worker so the FFT runs off the main thread (#14). The worker
 *  module is referenced by URL relative to the bundle so Next.js +
 *  Webpack/Turbopack inline it as a separate chunk. */
export async function analyseReferenceAsync(
  ctx: AudioContext,
  blob: Blob,
): Promise<MasteringMatch | null> {
  try {
    const arr = await blob.arrayBuffer();
    const buffer = await ctx.decodeAudioData(arr.slice(0));
    const mono = mixToMonoFloat32(buffer);

    if (typeof Worker === "undefined") {
      // SSR or environments without Workers: fall back to sync.
      return analyseMonoSamples(mono, buffer.sampleRate);
    }

    const worker = new Worker(
      new URL("./matcheringWorker.ts", import.meta.url),
      { type: "module" },
    );

    const result = await new Promise<MasteringMatch | null>((resolve) => {
      let settled = false;
      const finish = (value: MasteringMatch | null) => {
        if (settled) return;
        settled = true;
        worker.terminate();
        resolve(value);
      };
      // 8 second budget — much longer than a real 16K-bin FFT takes;
      // anything beyond means the worker hung and we should give up.
      const timer = window.setTimeout(() => finish(null), 8000);

      worker.addEventListener("message", (event: MessageEvent) => {
        const data = event.data as
          | { type: "result"; match: MasteringMatch }
          | { type: "error"; message: string };
        window.clearTimeout(timer);
        if (data.type === "result") finish(data.match);
        else finish(null);
      });
      worker.addEventListener("error", () => {
        window.clearTimeout(timer);
        finish(null);
      });

      // Transfer ownership of the underlying buffer so the worker
      // doesn't have to copy it.
      worker.postMessage(
        { type: "analyse", mono, sampleRate: buffer.sampleRate },
        [mono.buffer],
      );
    });

    return result;
  } catch {
    return null;
  }
}
