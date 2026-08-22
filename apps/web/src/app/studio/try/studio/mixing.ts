export type StudioRoute = { from: string; to: string };
export type MixSuggestion<T extends Record<string, unknown> = Record<string, unknown>> = {
  id: string;
  trackId: string;
  patch: Partial<T>;
  previous: Partial<T>;
};

export const STUDIO_EFFECTS = [
  { id:"vocal-polish", name:"Vocal Polish", category:"Vocal", description:"Presence, control, and air" },
  { id:"warm-compressor", name:"Warm Compressor", category:"Dynamics", description:"Smooth musical leveling" },
  { id:"plate-space", name:"Plate Space", category:"Reverb", description:"Bright vocal and snare depth" },
  { id:"low-end-focus", name:"Low-End Focus", category:"Mastering", description:"Tight bass translation" },
] as const;

export function validateRouting(routes: StudioRoute[]) {
  const graph = new Map<string, string[]>();
  for (const route of routes) graph.set(route.from, [...(graph.get(route.from) ?? []), route.to]);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cyclic = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of graph.get(node) ?? []) if (cyclic(next)) return true;
    visiting.delete(node); visited.add(node); return false;
  };
  for (const node of graph.keys()) if (cyclic(node)) return { valid:false as const, reason:"Routing cycle detected" };
  return { valid:true as const };
}

export function applyMixSuggestion<T extends { tracks: Array<Record<string, unknown> & { id: string }> }>(session: T, suggestion: MixSuggestion) {
  return { ...session, tracks: session.tracks.map((track) => track.id === suggestion.trackId ? { ...track, ...suggestion.patch } : track) };
}

export function removeMixSuggestion<T extends { tracks: Array<Record<string, unknown> & { id: string }> }>(session: T, suggestion: MixSuggestion) {
  return { ...session, tracks: session.tracks.map((track) => track.id === suggestion.trackId ? { ...track, ...suggestion.previous } : track) };
}

export function getMeterState({ peakDb }: { peakDb: number; rmsDb: number }) {
  const clipping = peakDb > 0;
  return { clipping, tone: clipping ? "danger" as const : peakDb > -6 ? "warning" as const : "healthy" as const };
}

export function searchEffects(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [...STUDIO_EFFECTS];
  return STUDIO_EFFECTS.filter((effect) => `${effect.name} ${effect.category} ${effect.description}`.toLowerCase().includes(normalized));
}
