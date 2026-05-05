import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const outputDir = path.join(repoRoot, "apps/web/public/demo/audio");

const fileNames = [
  "back-then-drunk.wav",
  "bankston-brothers.wav",
  "bodega.wav",
  "clear-the-record.wav",
  "dog-food.wav",
  "pay-like-you-weigh.wav",
];

const sampleRate = 44100;
const channels = 2;
const bitsPerSample = 16;
const durationSeconds = 1.5;
const bytesPerSample = bitsPerSample / 8;
const frameCount = Math.floor(sampleRate * durationSeconds);
const dataSize = frameCount * channels * bytesPerSample;

function createSilentWavBuffer() {
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const wavBuffer = createSilentWavBuffer();

  await Promise.all(
    fileNames.map((fileName) => writeFile(path.join(outputDir, fileName), wavBuffer)),
  );

  console.log(`Created ${fileNames.length} placeholder demo WAV files in ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});