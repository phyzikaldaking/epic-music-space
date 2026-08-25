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

export async function startStudioBuffer(url: string, offsetSec = 0, when?: number, gainValue = 1) {
  const ctx = await resumeStudioAudio();
  const source = registerStudioSource(ctx.createBufferSource());
  source.buffer = await loadStudioAudioBuffer(url);
  const gain = ctx.createGain();
  gain.gain.value = Math.max(0, Math.min(2, gainValue));
  source.connect(gain).connect(ctx.destination);
  source.start(when ?? ctx.currentTime, Math.max(0, offsetSec));
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
