"use client";

// Promo-kit asset generation. All work runs client-side — no server
// round trips for image composition or audio clipping. The caller
// loads the song's existing audioUrl + coverUrl, then calls these
// to produce share-ready outputs (1080×1080 PNG, 1080×1920 PNG,
// 15-second WAV).

/** Build a Twitter/IG square promo cover from an existing cover image
 *  by drawing it onto a 1080×1080 canvas with title + artist overlay.
 *  Returns a PNG data URL. */
export async function generateSquareCover(args: {
  coverUrl: string | null;
  title: string;
  artist: string;
  /** When set, drawn as a small badge top-right ("EMS 8.4"). */
  emsScore?: number | null;
}): Promise<string> {
  return composeCover({ ...args, width: 1080, height: 1080 });
}

/** TikTok/Story vertical promo cover. Same composition logic, taller. */
export async function generateVerticalCover(args: {
  coverUrl: string | null;
  title: string;
  artist: string;
  emsScore?: number | null;
}): Promise<string> {
  return composeCover({ ...args, width: 1080, height: 1920 });
}

async function composeCover(args: {
  coverUrl: string | null;
  title: string;
  artist: string;
  emsScore?: number | null;
  width: number;
  height: number;
}): Promise<string> {
  const { width, height } = args;
  const canvas =
    typeof document === "undefined" ? null : document.createElement("canvas");
  if (!canvas) throw new Error("Canvas unavailable in this environment");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");

  // Background — either the cover scaled to fill (cover-fit) or the
  // brand gradient as fallback. We crossOrigin the cover so toDataURL
  // doesn't taint the canvas; if the host blocks CORS we fall through
  // to the gradient so the user still gets a usable image.
  let drewCover = false;
  if (args.coverUrl) {
    try {
      const img = await loadImage(args.coverUrl);
      drawCoverFit(ctx, img, width, height);
      drewCover = true;
    } catch {
      // Fall through.
    }
  }
  if (!drewCover) {
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, "#1a0a2a");
    grad.addColorStop(0.5, "#6c5cff");
    grad.addColorStop(1, "#00f5ff");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  // Dark vignette at the bottom so text reads on every cover. Gradient
  // height is proportional so the same code works for square and 9:16.
  const fadeStart = height * 0.45;
  const fade = ctx.createLinearGradient(0, fadeStart, 0, height);
  fade.addColorStop(0, "rgba(0,0,0,0)");
  fade.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, fadeStart, width, height - fadeStart);

  // EMS score chip (top-right) — small but visible.
  if (typeof args.emsScore === "number" && args.emsScore > 0) {
    const chipText = `EMS ${args.emsScore.toFixed(1)}`;
    ctx.font = `700 ${Math.round(width * 0.034)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    const padX = width * 0.025;
    const padY = padX * 0.55;
    const textMetrics = ctx.measureText(chipText);
    const chipW = textMetrics.width + padX * 2;
    const chipH = Math.round(width * 0.06);
    const chipX = width - chipW - width * 0.035;
    const chipY = width * 0.035;
    ctx.fillStyle = "rgba(255, 200, 50, 0.85)";
    roundRect(ctx, chipX, chipY, chipW, chipH, chipH / 2);
    ctx.fill();
    ctx.fillStyle = "#1a0a2a";
    ctx.textBaseline = "middle";
    ctx.fillText(chipText, chipX + padX, chipY + chipH / 2 + padY * 0.05);
  }

  // Title + artist overlay (bottom-left). Wraps title across at most
  // 3 lines so very long titles don't overflow. Font sizes scale with
  // width so the same code looks balanced on both aspect ratios.
  const margin = width * 0.06;
  const titleSize = Math.round(width * 0.085);
  const artistSize = Math.round(width * 0.038);
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "alphabetic";

  ctx.font = `400 ${artistSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const artistLine = args.artist;
  const artistMetrics = ctx.measureText(artistLine);

  ctx.font = `900 ${titleSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const titleLines = wrapText(ctx, args.title, width - margin * 2, 3);
  const titleBlockHeight = titleLines.length * titleSize * 1.05;

  const bottomPad = height * 0.075;
  const artistY = height - bottomPad;
  const titleBaseY = artistY - artistSize * 0.4 - artistMetrics.actualBoundingBoxAscent;

  // Draw title lines bottom-up so the LAST line of the wrap sits
  // closest to the artist line.
  for (let i = titleLines.length - 1; i >= 0; i--) {
    const y = titleBaseY - (titleLines.length - 1 - i) * titleSize * 1.05;
    ctx.fillText(titleLines[i], margin, y);
  }

  // Artist line under the title.
  ctx.font = `400 ${artistSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.fillText(artistLine, margin, artistY);

  void titleBlockHeight; // referenced for clarity; layout uses bottom-up draw

  return canvas.toDataURL("image/png");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

function drawCoverFit(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
) {
  const ar = img.width / img.height;
  const target = w / h;
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;
  if (ar > target) {
    // Source is wider than target — crop horizontally.
    sw = img.height * target;
    sx = (img.width - sw) / 2;
  } else {
    // Source is taller than target — crop vertically.
    sh = img.width / target;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    } else {
      current = test;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  // If we ran out of room, ellipsize the last line.
  if (lines.length === maxLines) {
    const remaining = words.slice(lines.join(" ").split(/\s+/).length).join(" ");
    if (remaining) {
      let last = lines[maxLines - 1];
      while (
        last.length > 0 &&
        ctx.measureText(`${last}…`).width > maxWidth
      ) {
        last = last.slice(0, -1);
      }
      lines[maxLines - 1] = `${last}…`;
    }
  }
  return lines;
}

// ─────────────────────────────────────────────────────────────────────
// 15-second audio clip extraction
// ─────────────────────────────────────────────────────────────────────

/** Find the loudest 15-second window in an audio file and return it as
 *  a WAV blob. "Loudest" is RMS over 1-second buckets averaged across
 *  a sliding 15-bucket window — fast enough on the main thread for
 *  ~3-minute tracks, off-load to a worker if you need longer. */
export async function extractLoudestClip(
  audioUrl: string,
  ctx: AudioContext,
  clipSeconds = 15,
): Promise<Blob> {
  const res = await fetch(audioUrl);
  if (!res.ok) throw new Error(`fetch audio: HTTP ${res.status}`);
  const arr = await res.arrayBuffer();
  const decoded = await ctx.decodeAudioData(arr);
  const sr = decoded.sampleRate;
  const bucketSize = sr; // 1-second buckets
  const windowBuckets = clipSeconds;
  const len = decoded.length;
  if (len <= clipSeconds * sr) {
    // Track is already short — return whole thing.
    return audioBufferToWav(decoded);
  }
  // Mix-down to mono RMS per bucket for the energy calculation only;
  // we still write the original stereo (or mono) data back out.
  const numChannels = decoded.numberOfChannels;
  const numBuckets = Math.floor(len / bucketSize);
  const rmsBuckets = new Float32Array(numBuckets);
  for (let c = 0; c < numChannels; c++) {
    const data = decoded.getChannelData(c);
    for (let b = 0; b < numBuckets; b++) {
      let sum = 0;
      const start = b * bucketSize;
      for (let i = 0; i < bucketSize; i++) {
        const s = data[start + i] ?? 0;
        sum += s * s;
      }
      rmsBuckets[b] += Math.sqrt(sum / bucketSize) / numChannels;
    }
  }
  // Sliding window sum (faster than recomputing each step).
  let bestStartBucket = 0;
  let bestEnergy = -Infinity;
  let windowEnergy = 0;
  for (let i = 0; i < Math.min(windowBuckets, numBuckets); i++) {
    windowEnergy += rmsBuckets[i];
  }
  bestEnergy = windowEnergy;
  for (let i = windowBuckets; i < numBuckets; i++) {
    windowEnergy += rmsBuckets[i] - rmsBuckets[i - windowBuckets];
    if (windowEnergy > bestEnergy) {
      bestEnergy = windowEnergy;
      bestStartBucket = i - windowBuckets + 1;
    }
  }
  const startSample = bestStartBucket * bucketSize;
  const endSample = Math.min(len, startSample + clipSeconds * sr);
  const clipLength = endSample - startSample;

  // Write a new AudioBuffer of just the clip.
  const clipBuf = ctx.createBuffer(numChannels, clipLength, sr);
  for (let c = 0; c < numChannels; c++) {
    const src = decoded.getChannelData(c);
    const dst = clipBuf.getChannelData(c);
    for (let i = 0; i < clipLength; i++) dst[i] = src[startSample + i];
  }
  // Apply 50ms fade-in / fade-out so the cut doesn't click.
  const fadeSamples = Math.min(clipLength, Math.round(sr * 0.05));
  for (let c = 0; c < numChannels; c++) {
    const data = clipBuf.getChannelData(c);
    for (let i = 0; i < fadeSamples; i++) {
      const gain = i / fadeSamples;
      data[i] *= gain;
      data[clipLength - 1 - i] *= gain;
    }
  }
  return audioBufferToWav(clipBuf);
}

/** Minimal 16-bit PCM WAV encoder. */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length * numChannels * 2 + 44;
  const ab = new ArrayBuffer(length);
  const view = new DataView(ab);
  let offset = 0;
  function writeString(s: string) {
    for (let i = 0; i < s.length; i++) view.setUint8(offset++, s.charCodeAt(i));
  }
  function writeU32(v: number) {
    view.setUint32(offset, v, true);
    offset += 4;
  }
  function writeU16(v: number) {
    view.setUint16(offset, v, true);
    offset += 2;
  }
  writeString("RIFF");
  writeU32(length - 8);
  writeString("WAVE");
  writeString("fmt ");
  writeU32(16);
  writeU16(1);
  writeU16(numChannels);
  writeU32(sampleRate);
  writeU32(sampleRate * numChannels * 2);
  writeU16(numChannels * 2);
  writeU16(16);
  writeString("data");
  writeU32(length - offset - 4);
  // Interleave channels.
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}
