"use client";

import { trackStudio, trackStudioError } from "./studioTelemetry";

type AudioContextCtor = new () => AudioContext;

type MixerChannel = { gain: GainNode; pan: StereoPannerNode; analyser: AnalyserNode; muted: boolean; solo: boolean; volume: number; panValue: number };
type AudioRegistry = {
  context: AudioContext | null;
  sources: Set<AudioBufferSourceNode>;
  media: Set<HTMLAudioElement>;
  gestureBound: boolean;
  mixer: Map<string, MixerChannel>;
  masterGain: GainNode | null;
  masterLimiter: DynamicsCompressorNode | null;
  masterVolume: number;
};

const KEY = "__ems_shared_audio_registry__";

function registry(): AudioRegistry {
  const win = window as Window & { [KEY]?: AudioRegistry };
  if (!win[KEY]) win[KEY] = { context: null, sources: new Set(), media: new Set(), gestureBound: false, mixer: new Map(), masterGain: null, masterLimiter: null, masterVolume: 1 };
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
  state.mixer ??= new Map();
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

export function setStudioMixerChannel(id: string, settings: { volume?: number; pan?: number; muted?: boolean; solo?: boolean }) {
  const ctx = getStudioAudioContext();
  const state = registry();
  state.mixer ??= new Map();
  let channel = state.mixer.get(id);
  if (!channel) {
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    gain.connect(pan).connect(analyser);
    channel = { gain, pan, analyser, muted: false, solo: false, volume: 1, panValue: 0 };
    state.mixer.set(id, channel);
  }
  Object.assign(channel, { muted: settings.muted ?? channel.muted, solo: settings.solo ?? channel.solo, volume: settings.volume ?? channel.volume, panValue: settings.pan ?? channel.panValue });
  const anySolo = Array.from(state.mixer.values()).some((item) => item.solo);
  state.mixer.forEach((item) => { item.gain.gain.value = item.muted || (anySolo && !item.solo) ? 0 : Math.max(0, Math.min(2, item.volume)); });
  channel.pan.pan.value = Math.max(-1, Math.min(1, channel.panValue / 100));
}
export function getStudioMixerMeters() {
  const state = registry();
  const meters: Record<string, number> = {};
  state.mixer.forEach((channel, id) => {
    const data = new Uint8Array(channel.analyser.fftSize);
    channel.analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const value of data) { const sample = (value - 128) / 128; sum += sample * sample; }
    meters[id] = Math.min(100, Math.max(0, Math.sqrt(sum / data.length) * 260));
  });
  if (state.masterGain) meters.master = Math.min(100, Math.max(0, state.masterVolume * 50));
  return meters;
}
export function setStudioMasterVolume(volume: number) {
  const state = registry();
  state.masterVolume = Math.max(0, Math.min(2, volume));
  if (state.masterGain) state.masterGain.gain.value = state.masterVolume;
}
function mixerDestination(trackId: string | undefined, ctx: AudioContext) {
  const state = registry();
  if (!state.masterGain) {
    state.masterGain = ctx.createGain();
    state.masterLimiter = ctx.createDynamicsCompressor();
    state.masterLimiter.threshold.value = -1;
    state.masterLimiter.knee.value = 0;
    state.masterLimiter.ratio.value = 20;
    state.masterLimiter.attack.value = 0.001;
    state.masterLimiter.release.value = 0.12;
    state.masterGain.gain.value = state.masterVolume;
    state.masterGain.connect(state.masterLimiter).connect(ctx.destination);
  }
  if (!trackId) return state.masterGain;
  setStudioMixerChannel(trackId, {});
  const channel = state.mixer.get(trackId)!;
  channel.analyser.connect(state.masterGain);
  return channel.gain;
}
export async function startStudioBuffer(
  url: string,
  offsetSec = 0,
  when?: number,
  gainValue = 1,
  fadeInSec = 0,
  fadeOutSec = 0,
  durationSec?: number,
  trackId?: string,
) {
  const ctx = await resumeStudioAudio();
  const source = registerStudioSource(ctx.createBufferSource());
  source.buffer = await loadStudioAudioBuffer(url);
  const startAt = when ?? ctx.currentTime;
  const offset = Math.max(0, Math.min(source.buffer.duration, offsetSec));
  const remaining = Math.max(0.01, Math.min(durationSec ?? source.buffer.duration - offset, source.buffer.duration - offset));
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
  source.connect(gain).connect(mixerDestination(trackId, ctx));
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
