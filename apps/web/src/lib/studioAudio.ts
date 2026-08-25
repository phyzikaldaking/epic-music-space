"use client";

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
