"use client";

import { useSyncExternalStore } from "react";

/** Shared, lightweight snapshot of what the user is doing inside the EMS
 *  Studio. The DAW publishes to this store as a side-effect of meaningful
 *  state changes; the AI Coach reads from it so its replies reference the
 *  current project (BPM, kit, armed track, etc.) without having to thread
 *  props through unrelated layers. */
export interface StudioContext {
  route: string;
  bpm: number | null;
  trackCount: number;
  armedTracks: number;
  hasRecordedAudio: boolean;
  beatKit: string | null;
  beatEnabled: boolean;
  selectedTrackName: string | null;
  lastAction: string | null;
  guestMode: boolean;
  /** Detected or user-set project key (e.g. "C", "F#m"). Null until
   *  the user picks one or the engine's chord detector commits one
   *  with confidence. Sample library reads this to highlight matching
   *  loops. */
  projectKey: string | null;
  /** Compact beat-pattern fingerprint (#E32). "kick:9001 snare:1010
   *  hat:5555" etc — 16-bit hex per lane. AI Coach reads this so its
   *  drum suggestions reference the actual pattern producers are
   *  working with. */
  beatPatternHex: string | null;
}

const initialContext: StudioContext = {
  route: "",
  bpm: null,
  trackCount: 0,
  armedTracks: 0,
  hasRecordedAudio: false,
  beatKit: null,
  beatEnabled: false,
  selectedTrackName: null,
  lastAction: null,
  guestMode: false,
  projectKey: null,
  beatPatternHex: null,
};

let current: StudioContext = initialContext;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

/** Merge a partial context into the live snapshot. The DAW calls this from
 *  a useEffect dependent on its own state — no-op when the partial would
 *  not change anything. */
export function setStudioContext(partial: Partial<StudioContext>): void {
  let changed = false;
  const next: StudioContext = { ...current };
  for (const key of Object.keys(partial) as Array<keyof StudioContext>) {
    const value = partial[key];
    if (value === undefined) continue;
    if ((next as unknown as Record<string, unknown>)[key] !== value) {
      (next as unknown as Record<string, unknown>)[key] = value;
      changed = true;
    }
  }
  if (!changed) return;
  current = next;
  emit();
}

/** Reset the studio context (call when leaving /studio routes). */
export function clearStudioContext(): void {
  if (current === initialContext) return;
  current = initialContext;
  emit();
}

export function getStudioContext(): StudioContext {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** React hook: returns the live studio context, re-rendering when any
 *  field changes. Server-render-safe (returns the initial snapshot). */
export function useStudioContext(): StudioContext {
  return useSyncExternalStore(subscribe, getStudioContext, () => initialContext);
}
