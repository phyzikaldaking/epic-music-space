export type SampleLibraryEntry = { id: string; name: string; instrument: string; genre: string[]; mood: string[]; bpm: number | null; key: string | null; favorite: boolean; lastUsedAt: number | null };

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

export function indexSamples(samples: SampleLibraryEntry[]) {
  return {
    instruments: unique(samples.map((sample) => sample.instrument)),
    genres: unique(samples.flatMap((sample) => sample.genre)),
    moods: unique(samples.flatMap((sample) => sample.mood)),
    keys: unique(samples.flatMap((sample) => sample.key ? [sample.key] : [])),
  };
}

export function searchSamples(samples: SampleLibraryEntry[], query: { text?: string; instrument?: string; genre?: string; mood?: string; bpm?: number; bpmTolerance?: number; key?: string; favoritesOnly?: boolean; sort?: "recent" | "name" } = {}) {
  const text = query.text?.trim().toLowerCase();
  const tolerance = Math.max(0, query.bpmTolerance ?? 5);
  const results = samples.filter((sample) => (!text || sample.name.toLowerCase().includes(text))
    && (!query.instrument || sample.instrument === query.instrument)
    && (!query.genre || sample.genre.includes(query.genre))
    && (!query.mood || sample.mood.includes(query.mood))
    && (query.bpm === undefined || sample.bpm !== null && Math.abs(sample.bpm - query.bpm) <= tolerance)
    && (!query.key || sample.key === query.key)
    && (!query.favoritesOnly || sample.favorite));
  if (query.sort === "recent") return results.sort((left, right) => (right.lastUsedAt ?? -1) - (left.lastUsedAt ?? -1));
  if (query.sort === "name") return results.sort((left, right) => left.name.localeCompare(right.name));
  return results;
}
