export type SessionCapacityInput = {
  trackCount: number;
  durationMinutes: number;
  sampleRate: number;
  channelsPerTrack: number;
  bytesPerSample: number;
  decodedCacheBudgetBytes: number;
};

export const STUDIO_CERTIFICATION_FIXTURE: SessionCapacityInput = {
  trackCount: 32,
  durationMinutes: 60,
  sampleRate: 48_000,
  channelsPerTrack: 2,
  bytesPerSample: 4,
  decodedCacheBudgetBytes: 512 * 1024 * 1024,
};

export function estimateSessionCapacity(input: SessionCapacityInput) {
  const fullDecodeBytes = input.trackCount * input.durationMinutes * 60 * input.sampleRate * input.channelsPerTrack * input.bytesPerSample;
  const workingSetBytes = Math.min(fullDecodeBytes, input.decodedCacheBudgetBytes);
  return {
    trackCount: input.trackCount,
    durationMinutes: input.durationMinutes,
    fullDecodeBytes,
    workingSetBytes,
    strategy: fullDecodeBytes > input.decodedCacheBudgetBytes ? "stream-and-cache" as const : "full-decode" as const,
    certified: input.trackCount <= 32 && input.durationMinutes <= 60 && workingSetBytes <= 512 * 1024 * 1024,
  };
}

export function chooseBufferEvictions(buffers: Array<{ id: string; bytes: number; lastUsedAt: number; pinned: boolean }>, budgetBytes: number) {
  let residentBytes = buffers.reduce((total, buffer) => total + buffer.bytes, 0);
  const evictions: string[] = [];
  for (const buffer of buffers.filter((item) => !item.pinned).sort((left, right) => left.lastUsedAt - right.lastUsedAt)) {
    if (residentBytes <= budgetBytes) break;
    residentBytes -= buffer.bytes;
    evictions.push(buffer.id);
  }
  return evictions;
}
