import { describe, expect, it } from "vitest";
import { cancelExportJob, createExportJob, failExportJob, retryExportJob, updateExportProgress } from "@/app/studio/try/studio/exportJob";

describe("Studio export jobs", () => {
  it("supports WAV, MP3, stems, sample rate, bit depth, normalization, and metadata", () => {
    const job = createExportJob({ id: "e1", format: "wav", mode: "stems", sampleRate: 96_000, bitDepth: 24, normalize: true, metadata: { title: "Song", artist: "Artist" } });
    expect(job).toMatchObject({ status: "queued", progress: 0, format: "wav", mode: "stems", sampleRate: 96_000, bitDepth: 24, normalize: true, metadata: { title: "Song" } });
    expect(createExportJob({ id: "e2", format: "mp3", mode: "mix", sampleRate: 48_000, bitDepth: 16, normalize: false, metadata: {} }).format).toBe("mp3");
  });
  it("reports progress, cancellation, failure, and retry attempts", () => {
    let job = createExportJob({ id: "e1", format: "wav", mode: "mix", sampleRate: 48_000, bitDepth: 24, normalize: false, metadata: {} });
    job = updateExportProgress(job, 55);
    expect(job).toMatchObject({ status: "rendering", progress: 55 });
    expect(cancelExportJob(job)).toMatchObject({ status: "cancelled" });
    job = failExportJob(job, "network");
    expect(retryExportJob(job)).toMatchObject({ status: "queued", progress: 0, attempts: 2, error: undefined });
  });
});
