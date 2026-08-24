import slotSpec from "./slot-spec.json";

/** The official EMS Banger-First kit package.  This module intentionally has
 * no storage or credential dependencies so it can be imported by the browser
 * and by server-side manifest checks alike. */

export const OFFICIAL_SOURCE_CREATOR = "Terrell Sas" as const;
export const OFFICIAL_AUTHORIZED_REDISTRIBUTOR = "Epic Music Space" as const;
export const OFFICIAL_KIT_VERSION = "v1" as const;

export const OFFICIAL_KIT_LANES = slotSpec.lanes as unknown as readonly ["kick", "bass808", "snare", "clap", "hat", "perc", "vox", "fx"];
export type OfficialKitLane = (typeof OFFICIAL_KIT_LANES)[number];

export const OFFICIAL_KIT_VARIANTS = slotSpec.variants as unknown as readonly ["default", "alternate-1", "alternate-2"];
export type OfficialKitVariant = (typeof OFFICIAL_KIT_VARIANTS)[number];
export const OFFICIAL_KIT_SOURCE_KINDS = ["archive", "EMS-original-synth"] as const;
export type OfficialKitSourceKind = (typeof OFFICIAL_KIT_SOURCE_KINDS)[number];
export const OFFICIAL_KIT_IDS = slotSpec.kitIds as unknown as readonly ["phyzikal-knock", "fort-kane-drill", "platinum-rnb", "straight-gems", "arena-pressure"];
export const OFFICIAL_KIT_SLOT_KEYS = OFFICIAL_KIT_IDS.flatMap((kitId) => OFFICIAL_KIT_LANES.flatMap((lane) => OFFICIAL_KIT_VARIANTS.map((variant) => `${kitId}/${lane}/${variant}`)));

export interface OfficialKitCatalogEntry {
  id: string;
  name: string;
  description: string;
  genre: string;
  isDefault: boolean;
}

export interface OfficialKitArchiveProvenance {
  sourceCreator: typeof OFFICIAL_SOURCE_CREATOR;
  authorizedRedistributor: typeof OFFICIAL_AUTHORIZED_REDISTRIBUTOR;
  sourceArchive: "Phyz Kit {SSO} Kit.zip";
}

export interface OfficialKitOriginalSynthProvenance {
  sourceCreator: typeof OFFICIAL_AUTHORIZED_REDISTRIBUTOR;
  authorizedRedistributor: typeof OFFICIAL_AUTHORIZED_REDISTRIBUTOR;
  generation: "deterministic FFmpeg synthesis";
}

export type OfficialKitProvenance = OfficialKitArchiveProvenance | OfficialKitOriginalSynthProvenance;

export interface OfficialKitAudioSpec {
  sampleRateHz: 44100;
  channels: 1;
  encoding: "pcm_s16le";
  highPassHz: number;
  peakTargetDbfs: number;
  maxDurationSeconds: number;
}

export interface OfficialKitRecord {
  assetId: string;
  kitId: string;
  lane: OfficialKitLane;
  variant: OfficialKitVariant;
  version: typeof OFFICIAL_KIT_VERSION;
  storagePath: string;
  sourceKind: OfficialKitSourceKind;
  /** Null means this checked-in catalog is awaiting the supplied archive.
   * Resolved manifests always contain a member path derived from that archive. */
  sourceArchiveMember: string | null;
  provenance: OfficialKitProvenance;
  audio: OfficialKitAudioSpec;
}

export interface OfficialKitManifest {
  schemaVersion: 1;
  version: typeof OFFICIAL_KIT_VERSION;
  generatedAt: "2026-08-24T00:00:00.000Z";
  curationStatus: "awaiting-source" | "resolved";
  records: OfficialKitRecord[];
}

export const OFFICIAL_KIT_CATALOG: readonly OfficialKitCatalogEntry[] = [
  {
    id: "phyzikal-knock",
    name: "Phyzikal Knock",
    description: "Hard Atlanta knock with clean transients and low-end weight.",
    genre: "Atlanta trap",
    isDefault: true,
  },
  {
    id: "fort-kane-drill",
    name: "Fort Kane Drill",
    description: "Dry, tense drill drums with a sliding 808 pocket.",
    genre: "Drill",
    isDefault: false,
  },
  {
    id: "platinum-rnb",
    name: "Platinum R&B",
    description: "Polished, spacious drums for modern R&B and soul records.",
    genre: "R&B",
    isDefault: false,
  },
  {
    id: "straight-gems",
    name: "Straight Gems",
    description: "Versatile premium one-shots for focused writing sessions.",
    genre: "Hip-hop",
    isDefault: false,
  },
  {
    id: "arena-pressure",
    name: "Arena Pressure",
    description: "Wide, commanding hits built for big rooms and big hooks.",
    genre: "Cinematic trap",
    isDefault: false,
  },
] as const;

const LANE_AUDIO: Record<OfficialKitLane, Omit<OfficialKitAudioSpec, "sampleRateHz" | "channels" | "encoding">> = {
  kick: { highPassHz: 25, peakTargetDbfs: -1.5, maxDurationSeconds: 4 },
  bass808: { highPassHz: 20, peakTargetDbfs: -2.5, maxDurationSeconds: 12 },
  snare: { highPassHz: 70, peakTargetDbfs: -2, maxDurationSeconds: 4 },
  clap: { highPassHz: 70, peakTargetDbfs: -2.5, maxDurationSeconds: 4 },
  hat: { highPassHz: 250, peakTargetDbfs: -5, maxDurationSeconds: 4 },
  perc: { highPassHz: 60, peakTargetDbfs: -4, maxDurationSeconds: 4 },
  vox: { highPassHz: 80, peakTargetDbfs: -6, maxDurationSeconds: 15 },
  fx: { highPassHz: 25, peakTargetDbfs: -6, maxDurationSeconds: 15 },
};

const SOURCE_ARCHIVE = "Phyz Kit {SSO} Kit.zip" as const;
const variants = OFFICIAL_KIT_VARIANTS;

function createRecord(
  kit: OfficialKitCatalogEntry,
  lane: OfficialKitLane,
  variant: OfficialKitVariant,
): OfficialKitRecord {
  const assetId = `${kit.id}-${lane}-${variant}`;
  return {
    assetId,
    kitId: kit.id,
    lane,
    variant,
    version: OFFICIAL_KIT_VERSION,
    storagePath: `official/${kit.id}/${OFFICIAL_KIT_VERSION}/${lane}/${assetId}.wav`,
    sourceKind: "archive",
    sourceArchiveMember: null,
    provenance: {
      sourceCreator: OFFICIAL_SOURCE_CREATOR,
      authorizedRedistributor: OFFICIAL_AUTHORIZED_REDISTRIBUTOR,
      sourceArchive: SOURCE_ARCHIVE,
    },
    audio: {
      sampleRateHz: 44100,
      channels: 1,
      encoding: "pcm_s16le",
      ...LANE_AUDIO[lane],
    },
  };
}

export const OFFICIAL_KIT_RECORDS: readonly OfficialKitRecord[] = OFFICIAL_KIT_CATALOG.flatMap((kit) =>
  OFFICIAL_KIT_LANES.flatMap((lane) => variants.map((variant) => createRecord(kit, lane, variant))),
);

export const OFFICIAL_KIT_MANIFEST: OfficialKitManifest = {
  schemaVersion: 1,
  version: OFFICIAL_KIT_VERSION,
  generatedAt: "2026-08-24T00:00:00.000Z",
  curationStatus: "awaiting-source",
  records: [...OFFICIAL_KIT_RECORDS],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new Error(`Invalid official kit manifest: ${message}`);
}

function validateSourceArchiveMember(member: string, index: number): string {
  const normalized = member.normalize("NFC");
  const segments = member.split("/");
  if (member !== normalized) fail(`records[${index}] sourceArchiveMember is not Unicode-normalized`);
  if (member.includes("\\") || member.startsWith("/") || /^[A-Za-z]:\//.test(member)) fail(`records[${index}] sourceArchiveMember must be a relative POSIX path`);
  if (member.includes("//") || segments.some((segment) => segment === "" || segment === "." || segment === "..")) fail(`records[${index}] sourceArchiveMember contains invalid path segments`);
  if (!member.toLowerCase().endsWith(".wav") || segments.join("/") !== member) fail(`records[${index}] sourceArchiveMember must be a normalized .wav member path`);
  return member;
}

/** Validate untrusted JSON at the boundary.  The returned value is cloned so
 * callers cannot mutate the canonical catalog through a loader result. */
export function loadOfficialKitManifest(input: unknown): OfficialKitManifest {
  if (!isRecord(input)) fail("manifest must be an object");
  if (input.schemaVersion !== 1) fail("schemaVersion must be 1");
  if (input.version !== OFFICIAL_KIT_VERSION) fail(`version must be ${OFFICIAL_KIT_VERSION}`);
  if (input.generatedAt !== "2026-08-24T00:00:00.000Z") fail("generatedAt is not the approved deterministic timestamp");
  if (input.curationStatus !== "awaiting-source" && input.curationStatus !== "resolved") fail("curationStatus must be awaiting-source or resolved");
  if (!Array.isArray(input.records)) fail("records must be an array");
  if (input.records.length !== OFFICIAL_KIT_CATALOG.length * OFFICIAL_KIT_LANES.length * OFFICIAL_KIT_VARIANTS.length) {
    fail("records must contain exactly 120 entries");
  }

  const ids = new Set<string>();
  const slots = new Set<string>();
  const sourceMembers = new Set<string>();
  const catalogIds = new Set(OFFICIAL_KIT_CATALOG.map((kit) => kit.id));
  if (catalogIds.size !== OFFICIAL_KIT_IDS.length || OFFICIAL_KIT_IDS.some((kitId) => !catalogIds.has(kitId))) fail("catalog kit IDs do not match canonical slot spec");
  for (const [index, candidate] of input.records.entries()) {
    if (!isRecord(candidate)) fail(`records[${index}] must be an object`);
    const requiredStrings = ["assetId", "kitId", "lane", "variant", "version", "storagePath"];
    for (const field of requiredStrings) if (typeof candidate[field] !== "string" || candidate[field] === "") fail(`records[${index}].${field} must be a non-empty string`);
    if (candidate.sourceKind !== "archive" && candidate.sourceKind !== "EMS-original-synth") fail(`records[${index}].sourceKind must be archive or EMS-original-synth`);
    const sourceKind = candidate.sourceKind as OfficialKitSourceKind;
    if (candidate.sourceArchiveMember !== null && (typeof candidate.sourceArchiveMember !== "string" || candidate.sourceArchiveMember === "")) fail(`records[${index}].sourceArchiveMember must be null or a non-empty string`);
    if (sourceKind === "archive" && input.curationStatus === "resolved" && typeof candidate.sourceArchiveMember !== "string") fail(`records[${index}] is unresolved in a resolved manifest`);
    if (sourceKind === "EMS-original-synth" && candidate.sourceArchiveMember !== null) fail(`records[${index}] EMS-original-synth records cannot have an archive member`);
    if (typeof candidate.sourceArchiveMember === "string") {
      const member = validateSourceArchiveMember(candidate.sourceArchiveMember, index);
      if (sourceMembers.has(member)) fail(`duplicate sourceArchiveMember ${member}`);
      sourceMembers.add(member);
    }
    const kitId = candidate.kitId as string;
    const lane = candidate.lane as string;
    const variant = candidate.variant as string;
    if (!catalogIds.has(kitId)) fail(`records[${index}] references unknown kit ${kitId}`);
    if (!(OFFICIAL_KIT_LANES as readonly string[]).includes(lane)) fail(`records[${index}] references unknown lane ${lane}`);
    if (!(OFFICIAL_KIT_VARIANTS as readonly string[]).includes(variant)) fail(`records[${index}] references unknown variant ${variant}`);
    const assetId = candidate.assetId as string;
    if (ids.has(assetId)) fail(`duplicate assetId ${assetId}`);
    ids.add(assetId);
    const slot = `${kitId}/${lane}/${variant}`;
    if (slots.has(slot)) fail(`duplicate kit/lane/variant slot ${slot}`);
    slots.add(slot);
    if (candidate.version !== OFFICIAL_KIT_VERSION) fail(`records[${index}] has an unsupported version`);
    const expectedPath = `official/${kitId}/${OFFICIAL_KIT_VERSION}/${lane}/${assetId}.wav`;
    if (candidate.storagePath !== expectedPath) fail(`records[${index}] has an invalid immutable storagePath`);
    if (!isRecord(candidate.provenance)) fail(`records[${index}].provenance must be an object`);
    if (sourceKind === "archive") {
      const keys = Object.keys(candidate.provenance).sort();
      if (keys.join(",") !== "authorizedRedistributor,sourceArchive,sourceCreator") fail(`records[${index}] archive provenance must only contain approved archive fields`);
      if (candidate.provenance.sourceCreator !== OFFICIAL_SOURCE_CREATOR) fail(`records[${index}] source creator must be ${OFFICIAL_SOURCE_CREATOR}`);
      if (candidate.provenance.authorizedRedistributor !== OFFICIAL_AUTHORIZED_REDISTRIBUTOR) fail(`records[${index}] authorized redistributor must be ${OFFICIAL_AUTHORIZED_REDISTRIBUTOR}`);
      if (candidate.provenance.sourceArchive !== SOURCE_ARCHIVE) fail(`records[${index}] source archive is not approved`);
    } else {
      const keys = Object.keys(candidate.provenance).sort();
      if (keys.join(",") !== "authorizedRedistributor,generation,sourceCreator") fail(`records[${index}] EMS-original-synth provenance must only contain generator fields`);
      if (candidate.provenance.sourceCreator !== OFFICIAL_AUTHORIZED_REDISTRIBUTOR || candidate.provenance.authorizedRedistributor !== OFFICIAL_AUTHORIZED_REDISTRIBUTOR) fail(`records[${index}] EMS-original-synth provenance must credit Epic Music Space`);
      if (candidate.provenance.generation !== "deterministic FFmpeg synthesis") fail(`records[${index}] EMS-original-synth provenance generation is not approved`);
    }
    if (!isRecord(candidate.audio)) fail(`records[${index}].audio must be an object`);
    if (candidate.audio.sampleRateHz !== 44100 || candidate.audio.channels !== 1 || candidate.audio.encoding !== "pcm_s16le") fail(`records[${index}] must declare mono 44.1 kHz PCM s16le audio`);
    const laneSpec = LANE_AUDIO[lane as OfficialKitLane];
    if (candidate.audio.highPassHz !== laneSpec.highPassHz || candidate.audio.peakTargetDbfs !== laneSpec.peakTargetDbfs || candidate.audio.maxDurationSeconds !== laneSpec.maxDurationSeconds) fail(`records[${index}] has incorrect ${lane} audio thresholds`);
  }
  if (ids.size !== OFFICIAL_KIT_SLOT_KEYS.length || slots.size !== OFFICIAL_KIT_SLOT_KEYS.length) fail("manifest does not cover every canonical kit/lane/variant slot");
  for (const expectedSlot of OFFICIAL_KIT_SLOT_KEYS) if (!slots.has(expectedSlot)) fail(`manifest is missing canonical slot ${expectedSlot}`);
  return JSON.parse(JSON.stringify(input)) as OfficialKitManifest;
}

/** Bind every catalog slot to a real member path from the extracted archive.
 * This is intentionally separate from the checked-in awaiting-source catalog:
 * production processing must prove that every path exists and is unique. */
export function resolveOfficialKitManifestSources(
  manifestInput: unknown,
  sourceMembersBySlot: Record<string, string>,
): OfficialKitManifest {
  const manifest = loadOfficialKitManifest(manifestInput);
  const members = new Set<string>();
  const archiveRecords = manifest.records.filter((record) => record.sourceKind === "archive");
  const expectedSlots = new Set(archiveRecords.map((record) => `${record.kitId}/${record.lane}/${record.variant}`));
  const mappingSlots = Object.keys(sourceMembersBySlot);
  if (mappingSlots.length !== expectedSlots.size || mappingSlots.some((slot) => !expectedSlots.has(slot))) fail("source mapping keys do not exactly match manifest slots");
  const records = manifest.records.map((record) => {
    if (record.sourceKind === "EMS-original-synth") return record;
    const slot = `${record.kitId}/${record.lane}/${record.variant}`;
    const member = sourceMembersBySlot[slot];
    if (typeof member !== "string" || member.length === 0) fail(`missing sourceArchiveMember mapping for ${slot}`);
    validateSourceArchiveMember(member, manifest.records.indexOf(record));
    if (members.has(member)) fail(`duplicate sourceArchiveMember ${member}`);
    members.add(member);
    return { ...record, sourceArchiveMember: member };
  });
  return loadOfficialKitManifest({ ...manifest, curationStatus: "resolved", records });
}

export function getOfficialKitById(kitId: string): OfficialKitCatalogEntry | undefined {
  return OFFICIAL_KIT_CATALOG.find((kit) => kit.id === kitId);
}

export function getOfficialKitRecords(kitId: string, lane?: OfficialKitLane): readonly OfficialKitRecord[] {
  return OFFICIAL_KIT_RECORDS.filter((record) => record.kitId === kitId && (lane === undefined || record.lane === lane));
}

// Validate the checked-in package at module load so accidental edits fail fast.
loadOfficialKitManifest(OFFICIAL_KIT_MANIFEST);
