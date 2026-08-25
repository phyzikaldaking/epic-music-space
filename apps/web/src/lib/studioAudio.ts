"use client";

import { trackStudio, trackStudioError } from "./studioTelemetry";

type AudioContextCtor = new () => AudioContext;

type AudioRegistry = {
  context: AudioContext | null;
  sources: Set<AudioBufferSourceNode>;
  media: Set<HTMLAudioElement>;
  gestureBound: boolean;
};

const KEY = "__ems_shared_audio_registry__";

function registry(): AudioRegistry {
  const win = window as Window & { [KEY]?: AudioRegistry };
  if (!win[KEY]) win[KEY] = { context: null, sources: new Set(), media: new Set(), gestureBound: false };
  return win[KEY]!;
}

function getCtor(): AudioContextCtor {
  const ctor = window.AudioContext ?? (window as Window & { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  if (!ctor) throw new Error("Web Audio is unavailable in this browser.");
  return ctor;
}

function bindGestureResume(state: AudioRegistry) {
  if (state.gestureBound) return;
  state.gestureBound = true;
  const resume = () => { void resumeStudioAudio().catch(() => undefined); };
  ["pointerdown", "keydown", "touchstart"].forEach((event) => window.addEventListener(event, resume, { passive: true }));
}

export function getStudioAudioContext(): AudioContext {
  const state = registry();
  state.context ??= new (getCtor())();
  bindGestureResume(state);
  return state.context;
}

export async function resumeStudioAudio(): Promise<AudioContext> {
  const ctx = getStudioAudioContext();
  if (ctx.state === "suspended" || ctx.state === "interrupted") await ctx.resume();
  if (ctx.state !== "running") throw new Error("Audio is unavailable. Click the page and try again.");
  return ctx;
}

export function registerStudioSource(source: AudioBufferSourceNode) {
  registry().sources.add(source);
  source.addEventListener("ended", () => registry().sources.delete(source), { once: true });
  return source;
}

export function registerStudioMedia(media: HTMLAudioElement) {
  registry().media.add(media);
  return media;
}

const bufferCache = new Map<string, AudioBuffer>();
const bufferLoads = new Map<string, Promise<AudioBuffer>>();

export async function loadStudioAudioBuffer(url: string): Promise<AudioBuffer> {
  const cached = bufferCache.get(url);
  if (cached) return cached;
  const pending = bufferLoads.get(url) ?? (async () => {
    const ctx = await resumeStudioAudio();
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Audio request failed (${response.status})`);
    const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
    bufferCache.set(url, buffer);
    return buffer;
  })();
  bufferLoads.set(url, pending);
  try { return await pending; } finally { bufferLoads.delete(url); }
}

export async function startStudioBuffer(
  url: string,
  offsetSec = 0,
  when?: number,
  gainValue = 1,
  fadeInSec = 0,
  fadeOutSec = 0,
  durationSec?: number,
) {
  const ctx = await resumeStudioAudio();
  const source = registerStudioSource(ctx.createBufferSource());
  source.buffer = await loadStudioAudioBuffer(url);
  const startAt = when ?? ctx.currentTime;
  const offset = Math.max(0, Math.min(source.buffer.duration, offsetSec));
  const remaining = Math.max(0.01, durationSec ?? source.buffer.duration - offset);
  const gain = ctx.createGain();
  const peak = Math.max(0.0001, Math.min(2, gainValue));
  const fadeIn = Math.max(0, Math.min(remaining / 2, fadeInSec));
  const fadeOut = Math.max(0, Math.min(remaining / 2, fadeOutSec));
  const endAt = startAt + remaining;
  gain.gain.setValueAtTime(fadeIn > 0 ? 0.0001 : peak, startAt);
  if (fadeIn > 0) gain.gain.linearRampToValueAtTime(peak, startAt + fadeIn);
  if (fadeOut > 0) {
    gain.gain.setValueAtTime(peak, Math.max(startAt + fadeIn, endAt - fadeOut));
    gain.gain.linearRampToValueAtTime(0.0001, endAt);
  }
  source.connect(gain).connect(ctx.destination);
  source.start(startAt, offset, remaining);
  source.stop(endAt + 0.02);
  return source;
}

export function stopAllStudioAudio() {
  const state = registry();
  state.sources.forEach((source) => {
    try { source.stop(); } catch { /* already stopped */ }
    try { source.disconnect(); } catch { /* already disconnected */ }
  });
  state.sources.clear();
  state.media.forEach((media) => {
    media.pause();
    media.currentTime = 0;
    media.removeAttribute("src");
    media.load();
  });
  state.media.clear();
}

export function disposeStudioAudio() {
  stopAllStudioAudio();
  const state = registry();
  if (state.context && state.context.state !== "closed") void state.context.close().catch(() => undefined);
  state.context = null;
}
