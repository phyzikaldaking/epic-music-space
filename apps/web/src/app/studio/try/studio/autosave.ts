const TRANSIENT_KEYS = new Set(["updatedAt", "playhead", "positionSec", "meterPeak", "meterRms", "clipHoldUntil", "isPlaying", "countInRemainingBeats", "openMenu", "hoveredId"]);

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !TRANSIENT_KEYS.has(key))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, canonicalize(child)]));
}

export function projectSaveFingerprint(project: unknown) {
  return JSON.stringify(canonicalize(project));
}

type AutosaveProject = { id: string; title: string; [key: string]: unknown };
type TimerHandle = ReturnType<typeof setTimeout> | number;

export function createAutosaveScheduler(input: {
  now: () => number;
  authenticated: boolean;
  online: boolean;
  cloudThrottleMs?: number;
  writeLocal: (project: AutosaveProject) => Promise<void>;
  writeCloud: (project: AutosaveProject) => Promise<void>;
  schedule?: (callback: () => void | Promise<void>, delayMs: number) => TimerHandle;
  cancelSchedule?: (handle: TimerHandle) => void;
}) {
  const throttleMs = input.cloudThrottleMs ?? 15_000;
  const schedule = input.schedule ?? ((callback, delayMs) => setTimeout(() => void callback(), delayMs));
  const cancelSchedule = input.cancelSchedule ?? ((handle) => clearTimeout(handle));
  let online = input.online;
  let lastFingerprint: string | null = null;
  let lastCloudAt = Number.NEGATIVE_INFINITY;
  let pending: AutosaveProject | null = null;
  let timer: TimerHandle | null = null;
  let disposed = false;

  async function writeCloudIfReady(force = false) {
    if (disposed || !pending || !input.authenticated || !online) return;
    const elapsed = input.now() - lastCloudAt;
    if (!force && elapsed < throttleMs) {
      if (timer === null) timer = schedule(async () => {
        timer = null;
        await writeCloudIfReady();
      }, throttleMs - elapsed);
      return;
    }
    const project = pending;
    pending = null;
    await input.writeCloud(project);
    lastCloudAt = input.now();
  }

  return {
    async notify(project: AutosaveProject) {
      if (disposed) throw new Error("Autosave scheduler is disposed.");
      const fingerprint = projectSaveFingerprint(project);
      if (fingerprint === lastFingerprint) return;
      lastFingerprint = fingerprint;
      pending = project;
      await input.writeLocal(project);
      await writeCloudIfReady();
    },
    setOnline(value: boolean) { online = value; },
    async flush() {
      if (timer !== null) { cancelSchedule(timer); timer = null; }
      await writeCloudIfReady(true);
    },
    dispose() {
      if (timer !== null) cancelSchedule(timer);
      timer = null;
      disposed = true;
    },
  };
}
