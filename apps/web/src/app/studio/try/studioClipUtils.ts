import type { StudioAudioBufferRef, StudioClip, StudioTrack, WaveformPeaks } from "./studioWorkstationTypes";
import { buildWaveformPeaksFromAudioBuffer } from "./StudioWaveform";

export function makePlaceholderPeaks(seed = 1, durationSec = 8, count = 192): WaveformPeaks {
  const peaks = Array.from({ length: count }, (_, index) => {
    const pulse = Math.sin((index + seed) * 0.19) * 0.28 + Math.cos((index + seed) * 0.047) * 0.18;
    const transient = index % 24 === 0 ? 0.42 : index % 12 === 0 ? 0.24 : 0;
    return Number(Math.max(0.04, Math.min(0.98, 0.24 + pulse + transient)).toFixed(4));
  });
  return { peaks, durationSec, sampleRate: 48000 };
}

export function buildStudioAudioBufferRefFromAudioBuffer(id: string, name: string, buffer: AudioBuffer, source: StudioAudioBufferRef["source"] = "import"): StudioAudioBufferRef {
  const peaks = buildWaveformPeaksFromAudioBuffer(buffer, 512);
  return {
    id,
    name,
    durationSec: buffer.duration,
    sampleRate: buffer.sampleRate,
    channelCount: buffer.numberOfChannels,
    peaks,
    source,
    createdAt: new Date().toISOString(),
  };
}

export function createPlaceholderClip(track: StudioTrack, index: number, source: StudioClip["source"] = "placeholder"): StudioClip {
  const durationSec = track.kind === "midi" ? 6 : track.kind === "instrument" ? 8 : 10;
  const waveform = makePlaceholderPeaks(index + track.id.length, durationSec, 240);
  return {
    id: `clip-${track.id}-${Date.now()}-${index}`,
    trackId: track.id,
    name: source === "recording" ? `Take ${index}` : `${track.name} Clip`,
    startSec: Math.max(0, index * 1.25),
    durationSec,
    offsetSec: 0,
    color: track.color,
    waveform,
    source,
  };
}

export async function decodeFileToClip(file: File, audioContext: AudioContext, track: StudioTrack, startSec: number): Promise<{ bufferRef: StudioAudioBufferRef; clip: StudioClip }> {
  const id = `buffer-${Date.now()}-${file.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`;
  const arrayBuffer = await file.arrayBuffer();
  const buffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
  const bufferRef = buildStudioAudioBufferRefFromAudioBuffer(id, file.name, buffer, "import");
  const clip: StudioClip = {
    id: `clip-${id}`,
    trackId: track.id,
    name: file.name.replace(/\.[^.]+$/, ""),
    startSec,
    durationSec: bufferRef.durationSec,
    offsetSec: 0,
    color: track.color,
    waveform: bufferRef.peaks,
    audioBufferId: id,
    source: "import",
  };
  return { bufferRef, clip };
}
