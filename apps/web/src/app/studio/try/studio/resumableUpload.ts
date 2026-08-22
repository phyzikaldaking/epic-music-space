export type UploadCheckpoint = {
  sourceHash: string;
  fileName: string;
  sizeBytes: number;
  chunkBytes: number;
  nextChunk: number;
  uploadedBytes: number;
  resumeToken?: string;
  updatedAt: string;
};

export type UploadStore = {
  load(sourceHash: string): Promise<UploadCheckpoint | null>;
  save(checkpoint: UploadCheckpoint): Promise<void>;
  remove(sourceHash: string): Promise<void>;
};

export type UploadTransport = {
  findCompleted(input: { sourceHash: string; sizeBytes: number; signal?: AbortSignal }): Promise<{ sourceId: string; url: string } | null>;
  uploadChunk(input: { sourceHash: string; index: number; totalChunks: number; bytes: Blob; resumeToken?: string; signal?: AbortSignal }): Promise<{ resumeToken: string }>;
  finalize(input: { sourceHash: string; fileName: string; sizeBytes: number; totalChunks: number; resumeToken?: string; signal?: AbortSignal }): Promise<{ sourceId: string; url: string }>;
};

export type UploadProgress = UploadCheckpoint & { totalChunks: number };

function abortError() {
  return new DOMException("Upload cancelled", "AbortError");
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

export async function hashUploadSource(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function createMemoryUploadStore(): UploadStore {
  const checkpoints = new Map<string, UploadCheckpoint>();
  return {
    async load(sourceHash) { return checkpoints.get(sourceHash) ?? null; },
    async save(checkpoint) { checkpoints.set(checkpoint.sourceHash, { ...checkpoint }); },
    async remove(sourceHash) { checkpoints.delete(sourceHash); },
  };
}

export function createLocalUploadStore(storage: Storage, prefix = "ems.studio.upload.v1:"): UploadStore {
  return {
    async load(sourceHash) {
      try {
        const value = storage.getItem(`${prefix}${sourceHash}`);
        return value ? JSON.parse(value) as UploadCheckpoint : null;
      } catch { return null; }
    },
    async save(checkpoint) { storage.setItem(`${prefix}${checkpoint.sourceHash}`, JSON.stringify(checkpoint)); },
    async remove(sourceHash) { storage.removeItem(`${prefix}${sourceHash}`); },
  };
}

export async function runResumableUpload(blob: Blob, options: {
  fileName: string;
  transport: UploadTransport;
  store: UploadStore;
  chunkBytes?: number;
  maxRetries?: number;
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
  now?: () => string;
}) {
  const chunkBytes = Math.max(1, Math.floor(options.chunkBytes ?? 5 * 1024 * 1024));
  const maxRetries = Math.max(0, Math.floor(options.maxRetries ?? 2));
  const now = options.now ?? (() => new Date().toISOString());
  throwIfAborted(options.signal);
  const sourceHash = await hashUploadSource(blob);
  throwIfAborted(options.signal);
  const completed = await options.transport.findCompleted({ sourceHash, sizeBytes: blob.size, signal: options.signal });
  if (completed) return { ...completed, sourceHash, fileName: options.fileName, deduplicated: true as const };

  const totalChunks = Math.max(1, Math.ceil(blob.size / chunkBytes));
  const stored = await options.store.load(sourceHash);
  let checkpoint: UploadCheckpoint = stored?.sizeBytes === blob.size && stored.chunkBytes === chunkBytes
    ? stored
    : { sourceHash, fileName: options.fileName, sizeBytes: blob.size, chunkBytes, nextChunk: 0, uploadedBytes: 0, updatedAt: now() };

  for (let index = checkpoint.nextChunk; index < totalChunks; index += 1) {
    throwIfAborted(options.signal);
    const bytes = blob.slice(index * chunkBytes, Math.min(blob.size, (index + 1) * chunkBytes));
    let attempt = 0;
    let chunkResult: { resumeToken: string } | undefined;
    while (!chunkResult) {
      try {
        chunkResult = await options.transport.uploadChunk({ sourceHash, index, totalChunks, bytes, resumeToken: checkpoint.resumeToken, signal: options.signal });
      } catch (error) {
        throwIfAborted(options.signal);
        if (attempt >= maxRetries) throw error;
        attempt += 1;
      }
    }
    checkpoint = {
      ...checkpoint,
      nextChunk: index + 1,
      uploadedBytes: Math.min(blob.size, (index + 1) * chunkBytes),
      resumeToken: chunkResult.resumeToken,
      updatedAt: now(),
    };
    await options.store.save(checkpoint);
    options.onProgress?.({ ...checkpoint, totalChunks });
  }

  throwIfAborted(options.signal);
  const result = await options.transport.finalize({ sourceHash, fileName: options.fileName, sizeBytes: blob.size, totalChunks, resumeToken: checkpoint.resumeToken, signal: options.signal });
  await options.store.remove(sourceHash);
  return { ...result, sourceHash, fileName: options.fileName, deduplicated: false as const };
}
