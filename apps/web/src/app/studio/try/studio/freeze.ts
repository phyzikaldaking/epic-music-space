export type FreezeRender = { sourceId: string; url: string; renderedAt: string };
export type FrozenTrack<T> = T & { frozen: true; frozenRender: FreezeRender; freezeSource: T; clips: []; inserts: [] };

export function freezeTrack<T extends { id: string; clips: unknown[]; inserts: unknown[]; frozen: boolean }>(track: T, render: FreezeRender) {
  const source = structuredClone(track);
  const after = { ...structuredClone(track), frozen: true as const, frozenRender: { ...render }, freezeSource: source, clips: [] as [], inserts: [] as [] } as FrozenTrack<T>;
  return { label: "Freeze track", before: track, after, undo: track };
}

export function unfreezeTrack<T>(track: FrozenTrack<T>) {
  return structuredClone(track.freezeSource);
}
