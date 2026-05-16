"use client";

/**
 * Waveform visualization for video export. Decodes audio buffer, generates
 * peak data, and renders to canvas with customizable colors/scale.
 */

export interface WaveformOptions {
  width: number;
  height: number;
  color?: string;
  backgroundColor?: string;
  peakColor?: string;
  samples?: number; // How many peak samples to extract (default 2000)
}

/** Extract peak amplitude data from audio buffer for visualization */
export async function extractWaveformPeaks(
  audioBuffer: AudioBuffer,
  sampleCount: number = 2000
): Promise<Float32Array> {
  const rawData = audioBuffer.getChannelData(0); // Mono mix
  const blockSize = Math.floor(rawData.length / sampleCount);
  const filteredData = new Float32Array(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    let sum = 0;
    const blockStart = i * blockSize;
    for (let j = 0; j < blockSize; j++) {
      sum += Math.abs(rawData[blockStart + j]);
    }
    filteredData[i] = sum / blockSize;
  }

  return filteredData;
}

/** Render waveform peaks to canvas */
export function renderWaveformCanvas(
  canvas: HTMLCanvasElement,
  peaks: Float32Array,
  options: WaveformOptions
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const {
    color = "#00ff88",
    backgroundColor = "#0a0a0a",
    peakColor = "#00ddff",
  } = options;

  canvas.width = options.width;
  canvas.height = options.height;

  // Background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw waveform as vertical bars
  const centerY = canvas.height / 2;
  const barWidth = canvas.width / peaks.length;
  const scale = (canvas.height / 2) * 0.9; // Leave 10% margin

  ctx.fillStyle = color;
  for (let i = 0; i < peaks.length; i++) {
    const peak = Math.min(peaks[i], 1); // Clamp to [0,1]
    const barHeight = peak * scale;
    const x = i * barWidth;
    const y = centerY - barHeight / 2;

    ctx.fillRect(x, y, barWidth * 0.9, barHeight);
  }

  // Center line
  ctx.strokeStyle = peakColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, centerY);
  ctx.lineTo(canvas.width, centerY);
  ctx.stroke();
}

/** Render animated waveform frame for current playback position */
export function renderWaveformFrame(
  canvas: HTMLCanvasElement,
  peaks: Float32Array,
  currentTime: number,
  duration: number,
  options: WaveformOptions
): void {
  renderWaveformCanvas(canvas, peaks, options);

  // Overlay playhead
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const playheadX = (currentTime / duration) * canvas.width;
  ctx.strokeStyle = "#ff0088";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(playheadX, 0);
  ctx.lineTo(playheadX, canvas.height);
  ctx.stroke();
}

/** Convert canvas to ImageData for video frame encoding */
export function canvasToFrame(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
