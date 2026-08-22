export function authorizeKitUpload(input: { ownerId: string; actorId: string; usedBytes: number; quotaBytes: number; incomingBytes: number }) {
  const remainingBefore = Math.max(0, input.quotaBytes - input.usedBytes);
  if (input.ownerId !== input.actorId) return { allowed: false as const, reason: "owner" as const, remainingBytes: remainingBefore };
  if (input.incomingBytes > remainingBefore) return { allowed: false as const, reason: "quota" as const, remainingBytes: remainingBefore };
  return { allowed: true as const, remainingBytes: remainingBefore - input.incomingBytes };
}

export function buildDurableKitManifest(input: { id: string; ownerId: string; name: string; samples: Array<{ id: string; sourceId: string; storageUrl: string; sizeBytes: number }> }) {
  return { schemaVersion: 1 as const, id: input.id, ownerId: input.ownerId, name: input.name, samples: input.samples.map((sample) => ({ ...sample, durable: /^https:\/\//.test(sample.storageUrl) })) };
}
