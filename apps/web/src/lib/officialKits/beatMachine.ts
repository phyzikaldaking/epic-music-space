import {
  getOfficialKitById,
  loadOfficialKitManifest,
  OFFICIAL_KIT_LANES,
  OFFICIAL_KIT_MANIFEST,
  type OfficialKitLane,
  type OfficialKitManifest,
  type OfficialKitRecord,
  type OfficialKitSourceKind,
  type OfficialKitVariant,
} from ".";

export const DEFAULT_OFFICIAL_BEAT_MACHINE_KIT_ID = "phyzikal-knock" as const;

/** The first-run one-bar pattern. Step indexes are zero-based so playback can
 * feed it directly to a 16-step engine without display-index conversion. */
export const PHYZIKAL_KNOCK_STARTER_PATTERN: Readonly<Record<OfficialKitLane, readonly number[]>> = {
  kick: [0, 4, 8, 12],
  bass808: [0, 3, 8, 11, 14],
  snare: [4, 12],
  clap: [4, 12],
  hat: [0, 2, 4, 6, 8, 10, 12, 14],
  perc: [2, 6, 9, 13],
  vox: [7, 15],
  fx: [3, 11],
};

export interface OfficialKitAssetUrlOptions {
  /** Resolve an immutable storage path at the app boundary. This intentionally
   * has no Supabase client, credential, or local build-path dependency. */
  getAssetUrl?: (record: OfficialKitRecord) => string | undefined;
}

export interface OfficialKitBrowserSample {
  assetId: string;
  kitId: string;
  lane: OfficialKitLane;
  variant: OfficialKitVariant;
  storagePath: string;
  url?: string;
  sourceKind: OfficialKitSourceKind;
  sourceKindLabel: string;
  provenanceLabel: string;
}

export interface OfficialKitBrowserKit {
  id: string;
  name: string;
  description: string;
  genre: string;
  lanes: Record<OfficialKitLane, OfficialKitBrowserSample[]>;
}

export interface OfficialKitBrowserModel {
  status: "ready" | "fallback";
  selectedKitId: string;
  kits: OfficialKitBrowserKit[];
  error?: string;
  labels: {
    kitSelect: string;
    lane: (lane: OfficialKitLane) => string;
    preview: (sample: OfficialKitBrowserSample) => string;
  };
}

function sourceKindLabel(sourceKind: OfficialKitSourceKind): string {
  return sourceKind === "archive" ? "Archive source · Terrell Sas" : "EMS original synth";
}

function provenanceLabel(record: OfficialKitRecord): string {
  const provenance = record.provenance;
  if (record.sourceKind === "archive") {
    return `${provenance.sourceCreator} · authorized redistribution by ${provenance.authorizedRedistributor}`;
  }
  return `${provenance.sourceCreator} original synth · ${"generation" in provenance ? provenance.generation : "deterministic synthesis"}`;
}

function toSample(record: OfficialKitRecord, options: OfficialKitAssetUrlOptions): OfficialKitBrowserSample {
  return {
    assetId: record.assetId,
    kitId: record.kitId,
    lane: record.lane,
    variant: record.variant,
    storagePath: record.storagePath,
    url: options.getAssetUrl?.(record),
    sourceKind: record.sourceKind,
    sourceKindLabel: sourceKindLabel(record.sourceKind),
    provenanceLabel: provenanceLabel(record),
  };
}

function browserFromManifest(manifest: OfficialKitManifest, options: OfficialKitAssetUrlOptions): OfficialKitBrowserKit[] {
  return manifest.records.reduce<OfficialKitBrowserKit[]>((kits, record) => {
    let kit = kits.find((candidate) => candidate.id === record.kitId);
    if (!kit) {
      const catalog = getOfficialKitById(record.kitId);
      if (!catalog) return kits;
      kit = {
        id: catalog.id,
        name: catalog.name,
        description: catalog.description,
        genre: catalog.genre,
        lanes: Object.fromEntries(OFFICIAL_KIT_LANES.map((lane) => [lane, []])) as unknown as Record<OfficialKitLane, OfficialKitBrowserSample[]>,
      };
      kits.push(kit);
    }
    kit.lanes[record.lane].push(toSample(record, options));
    return kits;
  }, []);
}

function makeModel(manifest: OfficialKitManifest, options: OfficialKitAssetUrlOptions, status: OfficialKitBrowserModel["status"], error?: string): OfficialKitBrowserModel {
  return {
    status,
    selectedKitId: DEFAULT_OFFICIAL_BEAT_MACHINE_KIT_ID,
    kits: browserFromManifest(manifest, options),
    error,
    labels: {
      kitSelect: "Official kit selection",
      lane: (lane) => `Show ${lane} samples`,
      preview: (sample) => `Preview ${getOfficialKitById(sample.kitId)?.name ?? sample.kitId} ${sample.lane} ${sample.variant}`,
    },
  };
}

/** Validate an injected manifest before it reaches the browser. Bad remote
 * data never replaces the known-good first-run kit; callers can surface the
 * returned error while keeping the sequencer playable. */
export function loadOfficialKitBrowser(input: unknown = OFFICIAL_KIT_MANIFEST, options: OfficialKitAssetUrlOptions = {}): OfficialKitBrowserModel {
  try {
    return makeModel(loadOfficialKitManifest(input), options, "ready");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load official kits";
    return makeModel(loadOfficialKitManifest(OFFICIAL_KIT_MANIFEST), options, "fallback", message);
  }
}
