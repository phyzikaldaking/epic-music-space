import { describe, expect, it } from "vitest";
import {
  OFFICIAL_KIT_CATALOG,
  OFFICIAL_KIT_MANIFEST,
  OFFICIAL_KIT_RECORDS,
  loadOfficialKitManifest,
  resolveOfficialKitManifestSources,
} from "@/lib/officialKits";

describe("official EMS kit package", () => {
  it("contains the five curated kits and a complete 120-record lane matrix", () => {
    expect(OFFICIAL_KIT_CATALOG).toHaveLength(5);
    expect(OFFICIAL_KIT_RECORDS).toHaveLength(120);
    expect(new Set(OFFICIAL_KIT_RECORDS.map((record) => record.kitId)).size).toBe(5);

    for (const kit of OFFICIAL_KIT_CATALOG) {
      const records = OFFICIAL_KIT_RECORDS.filter((record) => record.kitId === kit.id);
      expect(records).toHaveLength(24);
      expect(new Set(records.map((record) => record.lane))).toEqual(
        new Set(["kick", "bass808", "snare", "clap", "hat", "perc", "vox", "fx"]),
      );
      expect(new Set(records.map((record) => record.variant))).toEqual(
        new Set(["default", "alternate-1", "alternate-2"]),
      );
    }
  });

  it("credits the source creator and authorized redistributor on every record", () => {
    for (const record of OFFICIAL_KIT_RECORDS) {
      expect(record.provenance.sourceCreator).toBe("Terrell Sas");
      expect(record.provenance.authorizedRedistributor).toBe("Epic Music Space");
      expect(record.storagePath).toMatch(
        /^official\/[a-z0-9-]+\/v1\/(kick|bass808|snare|clap|hat|perc|vox|fx)\/[a-z0-9-]+\.wav$/,
      );
      expect(record.sourceArchiveMember).toBeNull();
    }
  });

  it("strictly rejects malformed, duplicate, or unauthorized manifests", () => {
    expect(() => loadOfficialKitManifest(null)).toThrow(/manifest must be an object/i);
    expect(() =>
      loadOfficialKitManifest({
        ...OFFICIAL_KIT_MANIFEST,
        records: OFFICIAL_KIT_RECORDS.map((record, index) =>
          index === 0
            ? { ...record, provenance: { ...record.provenance, sourceCreator: "Unknown" } }
            : record,
        ),
      }),
    ).toThrow(/source creator/i);
    expect(() =>
      loadOfficialKitManifest({
        ...OFFICIAL_KIT_MANIFEST,
        records: OFFICIAL_KIT_RECORDS.map((record, index) =>
          index === OFFICIAL_KIT_RECORDS.length - 1 ? OFFICIAL_KIT_RECORDS[0] : record,
        ),
      }),
    ).toThrow(/duplicate/i);
  });

  it("keeps generated-source provenance distinct from archive provenance", () => {
    const generated = OFFICIAL_KIT_RECORDS.map((record, index) => index === 0
      ? {
          ...record,
          sourceKind: "EMS-original-synth" as const,
          sourceArchiveMember: null,
          provenance: {
            sourceCreator: "Epic Music Space" as const,
            authorizedRedistributor: "Epic Music Space" as const,
            generation: "deterministic FFmpeg synthesis" as const,
          },
        }
      : record,
    );
    expect(() => loadOfficialKitManifest({ ...OFFICIAL_KIT_MANIFEST, records: generated })).not.toThrow();
    expect(() => loadOfficialKitManifest({
      ...OFFICIAL_KIT_MANIFEST,
      records: generated.map((record, index) => index === 0
        ? { ...record, provenance: { ...record.provenance, sourceArchive: "Phyz Kit {SSO} Kit.zip" } }
        : record),
    })).toThrow(/EMS-original-synth provenance/i);

    const sourceMembers = Object.fromEntries(generated.filter((record) => record.sourceKind === "archive").map((record) => [
      `${record.kitId}/${record.lane}/${record.variant}`,
      `actual/${record.assetId}.wav`,
    ]));
    const resolved = resolveOfficialKitManifestSources({ ...OFFICIAL_KIT_MANIFEST, records: generated }, sourceMembers);
    expect(resolved.records[0].sourceArchiveMember).toBeNull();
    expect(resolved.records.slice(1).every((record) => record.sourceArchiveMember?.startsWith("actual/"))).toBe(true);
  });

  it("returns a defensive validated copy", () => {
    const loaded = loadOfficialKitManifest(OFFICIAL_KIT_MANIFEST);
    expect(loaded).toEqual(OFFICIAL_KIT_MANIFEST);
    expect(loaded).not.toBe(OFFICIAL_KIT_MANIFEST);
    expect(loaded.records).not.toBe(OFFICIAL_KIT_MANIFEST.records);
  });

  it("resolves source members only from a unique archive-backed mapping", () => {
    const mapping = Object.fromEntries(
      OFFICIAL_KIT_RECORDS.map((record) => [
        `${record.kitId}/${record.lane}/${record.variant}`,
        `actual/${record.assetId}.wav`,
      ]),
    );
    const resolved = resolveOfficialKitManifestSources(OFFICIAL_KIT_MANIFEST, mapping);
    expect(resolved.curationStatus).toBe("resolved");
    expect(resolved.records.every((record) => record.sourceArchiveMember?.startsWith("actual/"))).toBe(true);
    expect(() => loadOfficialKitManifest({
      ...resolved,
      records: resolved.records.map((record, index) => index === 0 ? { ...record, sourceArchiveMember: "../escape.wav" } : record),
    })).toThrow(/sourceArchiveMember|path/i);
    expect(() => loadOfficialKitManifest({
      ...resolved,
      records: resolved.records.map((record, index) => index === 0 ? { ...record, sourceArchiveMember: resolved.records[1].sourceArchiveMember } : record),
    })).toThrow(/duplicate sourceArchiveMember/i);
    expect(() => resolveOfficialKitManifestSources(OFFICIAL_KIT_MANIFEST, { ...mapping, "phyzikal-knock/kick/default": "actual/other.wav" })).not.toThrow();
    expect(() => resolveOfficialKitManifestSources(OFFICIAL_KIT_MANIFEST, {
      ...mapping,
      "phyzikal-knock/kick/default": "actual/shared.wav",
      "phyzikal-knock/kick/alternate-1": "actual/shared.wav",
    })).toThrow(/duplicate sourceArchiveMember/i);
    expect(() => resolveOfficialKitManifestSources(OFFICIAL_KIT_MANIFEST, {
      ...mapping,
      "phyzikal-knock/kick/default": "../escape.wav",
    })).toThrow(/unsafe|invalid path|sourceArchiveMember/i);
    expect(() => resolveOfficialKitManifestSources(OFFICIAL_KIT_MANIFEST, {
      ...mapping,
      "phyzikal-knock/kick/default": "/absolute.wav",
    })).toThrow(/relative|unsafe|sourceArchiveMember/i);
    expect(() => resolveOfficialKitManifestSources(OFFICIAL_KIT_MANIFEST, {
      ...mapping,
      "extra/slot": "actual/extra.wav",
    })).toThrow(/mapping keys/i);
  });
});
