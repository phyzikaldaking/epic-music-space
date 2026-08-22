export type StudioPreset = { id: string; instrument: string; name: string; tags: string[]; version: number; favorite: boolean; parameters: Record<string, unknown> };

export function searchPresets<T extends StudioPreset>(presets: T[], query: { text?: string; instrument?: string; favoritesOnly?: boolean } = {}) {
  const text = query.text?.toLowerCase().trim();
  return presets.filter((preset) => (!text || `${preset.name} ${preset.tags.join(" ")}`.toLowerCase().includes(text)) && (!query.instrument || preset.instrument === query.instrument) && (!query.favoritesOnly || preset.favorite));
}

export function previewPreset(preset: StudioPreset) {
  return { presetId: preset.id, version: preset.version, status: "previewing" as const, parameters: structuredClone(preset.parameters) };
}

export function togglePresetFavorite<T extends StudioPreset>(presets: T[], id: string) {
  return presets.map((preset) => preset.id === id ? { ...preset, favorite: !preset.favorite } : preset);
}
