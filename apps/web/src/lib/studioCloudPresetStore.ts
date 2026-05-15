export type StudioPluginPresetNode = {
  id: string;
  pluginId: string;
  enabled: boolean;
  order: number;
  parameters: Record<string, number>;
  modulation: Record<string, number>;
};

export type StudioPluginPreset = {
  id: string;
  userId: string;
  projectId: string;
  name: string;
  nodes: StudioPluginPresetNode[];
  createdAt: string;
  updatedAt: string;
};

const MEMORY_PRESET_STORE = new Map<string, StudioPluginPreset[]>();

function presetKey(userId: string, projectId: string) {
  return `${userId}:${projectId}`;
}

export async function listStudioPluginPresets(userId: string, projectId: string) {
  return MEMORY_PRESET_STORE.get(presetKey(userId, projectId)) ?? [];
}

export async function saveStudioPluginPreset(input: Omit<StudioPluginPreset, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
  const now = new Date().toISOString();
  const key = presetKey(input.userId, input.projectId);
  const current = MEMORY_PRESET_STORE.get(key) ?? [];
  const previous = input.id ? current.find((preset) => preset.id === input.id) : undefined;
  const preset: StudioPluginPreset = {
    id: input.id ?? `preset-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    userId: input.userId,
    projectId: input.projectId,
    name: input.name,
    nodes: input.nodes,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };
  MEMORY_PRESET_STORE.set(key, [...current.filter((item) => item.id !== preset.id), preset]);
  return preset;
}

export async function deleteStudioPluginPreset(userId: string, projectId: string, presetId: string) {
  const key = presetKey(userId, projectId);
  const current = MEMORY_PRESET_STORE.get(key) ?? [];
  MEMORY_PRESET_STORE.set(key, current.filter((preset) => preset.id !== presetId));
  return { deleted: true, presetId };
}
