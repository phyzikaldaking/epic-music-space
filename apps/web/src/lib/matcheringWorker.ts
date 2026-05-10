/// <reference lib="webworker" />
// Web worker that runs the matchering FFT off the main thread (#14).
// Caller posts { mono: Float32Array, sampleRate: number, fftSize: number };
// worker replies with { eq, rms, crest, bands }. The mono buffer is
// transferred (not copied), so the call site loses its reference.

import {
  analyseMonoSamples,
  type MasteringMatch,
} from "./matcheringCore";

interface AnalyseRequest {
  type: "analyse";
  mono: Float32Array;
  sampleRate: number;
}

interface AnalyseResponse {
  type: "result";
  match: MasteringMatch;
}

interface ErrorResponse {
  type: "error";
  message: string;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener("message", (event: MessageEvent<AnalyseRequest>) => {
  const { mono, sampleRate } = event.data;
  try {
    const match = analyseMonoSamples(mono, sampleRate);
    const response: AnalyseResponse = { type: "result", match };
    ctx.postMessage(response);
  } catch (err) {
    const response: ErrorResponse = {
      type: "error",
      message: err instanceof Error ? err.message : "FFT failed",
    };
    ctx.postMessage(response);
  }
});

export {};
