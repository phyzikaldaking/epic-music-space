import {
  DEFAULT_OFFICIAL_BEAT_MACHINE_KIT_ID,
  PHYZIKAL_KNOCK_STARTER_PATTERN,
  type OfficialKitBrowserKit,
} from "./beatMachine";
import type { OfficialKitLane } from ".";

export type BeatMachinePadId = "kick" | "snare" | "hat" | "clap" | "bass" | "perc" | "vox" | "fx";

export interface OfficialKitPlaybackConfig {
  kitId: string;
  sampleUrls: Partial<Record<BeatMachinePadId, string>>;
  starterPattern?: Partial<Record<BeatMachinePadId, readonly number[]>>;
}

export type OfficialPadPlayback =
  | { kind: "sample"; url: string }
  | { kind: "pending"; url: string }
  | { kind: "synth" };

export interface GenerationSafePrintPlan {
  config: OfficialKitPlaybackConfig | undefined;
  kitId: string | undefined;
  generation: number;
  retry: boolean;
  forceSynthFallback: boolean;
}

/** On a changed kit generation, Print switches to the current kit once. If it
 * changes again while loading, its current-kit render must synth-fallback
 * rather than schedule a pending (silent) sample. */
export function planGenerationSafePrint(
  snapshotConfig: OfficialKitPlaybackConfig | undefined,
  snapshotGeneration: number,
  currentConfig: OfficialKitPlaybackConfig | undefined,
  currentGeneration: number,
  retriesUsed: number,
): GenerationSafePrintPlan {
  const isCurrent = snapshotGeneration === currentGeneration
    && officialKitPlaybackConfigIdentity(snapshotConfig) === officialKitPlaybackConfigIdentity(currentConfig);
  if (isCurrent) {
    return { config: snapshotConfig, kitId: snapshotConfig?.kitId, generation: snapshotGeneration, retry: false, forceSynthFallback: false };
  }
  if (retriesUsed === 0) {
    return { config: currentConfig, kitId: currentConfig?.kitId, generation: currentGeneration, retry: true, forceSynthFallback: false };
  }
  return { config: currentConfig, kitId: currentConfig?.kitId, generation: currentGeneration, retry: false, forceSynthFallback: true };
}

export interface OfficialKitSelectionSnapshot {
  config: OfficialKitPlaybackConfig | undefined;
  configIdentity: string | undefined;
  generation: number;
}

export interface OfficialKitLoadTracker {
  /** Publishes a configuration at the component commit boundary. */
  commit: (config: OfficialKitPlaybackConfig | undefined) => OfficialKitSelectionSnapshot;
  current: () => OfficialKitSelectionSnapshot;
  isCurrent: (selection: OfficialKitSelectionSnapshot) => boolean;
}

export function officialKitPlaybackConfigIdentity(config: OfficialKitPlaybackConfig | undefined): string | undefined {
  if (!config) return undefined;
  return JSON.stringify({
    kitId: config.kitId,
    sampleUrls: Object.entries(config.sampleUrls).sort(([left], [right]) => left.localeCompare(right)),
    starterPattern: Object.entries(config.starterPattern ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([padId, steps]) => [padId, [...steps]]),
  });
}

function snapshotPlaybackConfig(config: OfficialKitPlaybackConfig | undefined): OfficialKitPlaybackConfig | undefined {
  if (!config) return undefined;
  return {
    kitId: config.kitId,
    sampleUrls: { ...config.sampleUrls },
    ...(config.starterPattern
      ? { starterPattern: Object.fromEntries(Object.entries(config.starterPattern).map(([padId, steps]) => [padId, steps ? [...steps] : steps])) }
      : {}),
  };
}

/** Keeps async fetch/decode work scoped to the last committed kit. */
export function createOfficialKitLoadTracker(): OfficialKitLoadTracker {
  let active: OfficialKitSelectionSnapshot = { config: undefined, configIdentity: undefined, generation: 0 };
  return {
    commit(config) {
      const committedConfig = snapshotPlaybackConfig(config);
      const configIdentity = officialKitPlaybackConfigIdentity(committedConfig);
      active = {
        config: committedConfig,
        configIdentity,
        generation: active.generation + (configIdentity === active.configIdentity ? 0 : 1),
      };
      return active;
    },
    current() {
      return active;
    },
    isCurrent(selection) {
      return selection.generation === active.generation && selection.configIdentity === active.configIdentity;
    },
  };
}

const PAD_BY_LANE: Record<OfficialKitLane, BeatMachinePadId> = {
  kick: "kick",
  bass808: "bass",
  snare: "snare",
  clap: "clap",
  hat: "hat",
  perc: "perc",
  vox: "vox",
  fx: "fx",
};

function firstSampleUrl(kit: OfficialKitBrowserKit, lane: OfficialKitLane): string | undefined {
  return kit.lanes[lane].find((sample) => sample.variant === "default")?.url ?? kit.lanes[lane][0]?.url;
}

export function createOfficialKitPlaybackConfig(kit: OfficialKitBrowserKit): OfficialKitPlaybackConfig {
  const sampleUrls: Partial<Record<BeatMachinePadId, string>> = {};
  (Object.keys(PAD_BY_LANE) as OfficialKitLane[]).forEach((lane) => {
    const url = firstSampleUrl(kit, lane);
    if (url) sampleUrls[PAD_BY_LANE[lane]] = url;
  });

  const starterPattern = kit.id === DEFAULT_OFFICIAL_BEAT_MACHINE_KIT_ID
    ? Object.fromEntries((Object.keys(PAD_BY_LANE) as OfficialKitLane[]).map((lane) => [PAD_BY_LANE[lane], PHYZIKAL_KNOCK_STARTER_PATTERN[lane]])) as Partial<Record<BeatMachinePadId, readonly number[]>>
    : undefined;

  return { kitId: kit.id, sampleUrls, starterPattern };
}

/** A configured URL stays pending until decoded; synthesis is reserved for a
 * missing or failed URL so a kit switch never silently changes its sound. */
export function resolveOfficialPadPlayback(
  config: OfficialKitPlaybackConfig | undefined,
  padId: BeatMachinePadId,
  sampleReady: boolean,
  sampleUnavailable: boolean,
): OfficialPadPlayback {
  const url = config?.sampleUrls[padId];
  if (!url || sampleUnavailable) return { kind: "synth" };
  return sampleReady ? { kind: "sample", url } : { kind: "pending", url };
}
