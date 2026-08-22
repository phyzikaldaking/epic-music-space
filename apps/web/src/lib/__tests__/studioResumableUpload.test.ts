import { describe, expect, it, vi } from "vitest";
import { createMemoryUploadStore, hashUploadSource, runResumableUpload, type UploadTransport } from "@/app/studio/try/studio/resumableUpload";

function transport(overrides: Partial<UploadTransport> = {}): UploadTransport {
  return {
    findCompleted: vi.fn(async () => null),
    uploadChunk: vi.fn(async ({ index }) => ({ resumeToken: `token-${index}` })),
    finalize: vi.fn(async ({ sourceHash }) => ({ sourceId: `source-${sourceHash.slice(0, 8)}`, url: "https://cdn.example/audio.wav" })),
    ...overrides,
  };
}

describe("Studio resumable uploads", () => {
  it("hashes identical source bytes to the same deduplication key", async () => {
    const a = new Blob(["same audio"], { type: "audio/wav" });
    const b = new Blob(["same audio"], { type: "audio/wav" });
    expect(await hashUploadSource(a)).toBe(await hashUploadSource(b));
  });

  it("uploads chunks, reports byte progress, checkpoints, and finalizes", async () => {
    const store = createMemoryUploadStore();
    const api = transport();
    const progress: number[] = [];
    const result = await runResumableUpload(new Blob(["abcdefghij"]), { fileName: "audio.wav", chunkBytes: 4, transport: api, store, onProgress: (event) => progress.push(event.uploadedBytes) });
    expect(api.uploadChunk).toHaveBeenCalledTimes(3);
    expect(progress).toEqual([4, 8, 10]);
    expect(result.url).toContain("audio.wav");
    expect(await store.load(result.sourceHash)).toBeNull();
  });

  it("retries transient chunks and resumes from the durable checkpoint", async () => {
    const store = createMemoryUploadStore();
    const first = transport({ uploadChunk: vi.fn().mockResolvedValueOnce({ resumeToken: "token-0" }).mockRejectedValue(new Error("offline")) });
    await expect(runResumableUpload(new Blob(["abcdefgh"]), { fileName: "take.wav", chunkBytes: 4, maxRetries: 0, transport: first, store })).rejects.toThrow("offline");
    const second = transport();
    await runResumableUpload(new Blob(["abcdefgh"]), { fileName: "take.wav", chunkBytes: 4, transport: second, store });
    expect(second.uploadChunk).toHaveBeenCalledTimes(1);
    expect(second.uploadChunk).toHaveBeenCalledWith(expect.objectContaining({ index: 1, resumeToken: "token-0" }));
  });

  it("returns a completed duplicate without uploading and supports cancellation", async () => {
    const existing = { sourceId: "source-existing", url: "https://cdn.example/existing.wav" };
    const duplicate = transport({ findCompleted: vi.fn(async () => existing) });
    await expect(runResumableUpload(new Blob(["audio"]), { fileName: "audio.wav", transport: duplicate, store: createMemoryUploadStore() })).resolves.toMatchObject({ deduplicated: true, ...existing });
    expect(duplicate.uploadChunk).not.toHaveBeenCalled();

    const controller = new AbortController();
    controller.abort();
    await expect(runResumableUpload(new Blob(["audio"]), { fileName: "audio.wav", transport: transport(), store: createMemoryUploadStore(), signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});
