import { describe, expect, it } from "vitest";

import {
  DEFAULT_OFFICIAL_BEAT_MACHINE_KIT_ID,
  PHYZIKAL_KNOCK_STARTER_PATTERN,
  loadOfficialKitBrowser,
} from "@/lib/officialKits/beatMachine";
import { OFFICIAL_KIT_MANIFEST } from "@/lib/officialKits";

describe("official Beat Machine kit loader", () => {
  it("starts on Phyzikal Knock with a playable trap starter pattern", () => {
    expect(DEFAULT_OFFICIAL_BEAT_MACHINE_KIT_ID).toBe("phyzikal-knock");
    expect(PHYZIKAL_KNOCK_STARTER_PATTERN.kick).toEqual([0, 4, 8, 12]);
    expect(PHYZIKAL_KNOCK_STARTER_PATTERN.bass808).toEqual([0, 3, 8, 11, 14]);
    expect(PHYZIKAL_KNOCK_STARTER_PATTERN.hat).toContain(10);
  });

  it("normalizes an injected asset URL without changing the immutable storage path", () => {
    const browser = loadOfficialKitBrowser(OFFICIAL_KIT_MANIFEST, {
      getAssetUrl: (record) => `https://cdn.example.test/${record.storagePath}`,
    });
    const kick = browser.kits[0].lanes.kick[0];

    expect(kick.url).toBe("https://cdn.example.test/official/phyzikal-knock/v1/kick/phyzikal-knock-kick-default.wav");
    expect(kick.storagePath).toBe("official/phyzikal-knock/v1/kick/phyzikal-knock-kick-default.wav");
  });

  it("switches kits while retaining source kind and human-readable provenance", () => {
    const browser = loadOfficialKitBrowser(OFFICIAL_KIT_MANIFEST);
    const drill = browser.kits.find((kit) => kit.id === "fort-kane-drill");

    expect(drill?.name).toBe("Fort Kane Drill");
    expect(drill?.lanes.kick[0]).toMatchObject({
      sourceKind: "archive",
      provenanceLabel: "Terrell Sas · authorized redistribution by Epic Music Space",
    });
  });

  it("falls back to the canonical default kit when an injected manifest fails strict validation", () => {
    const browser = loadOfficialKitBrowser({ ...OFFICIAL_KIT_MANIFEST, version: "untrusted" });

    expect(browser.status).toBe("fallback");
    expect(browser.selectedKitId).toBe("phyzikal-knock");
    expect(browser.error).toMatch(/Invalid official kit manifest/i);
  });

  it("exposes stable labels for kit selection, lane selection, and sample preview", () => {
    const browser = loadOfficialKitBrowser(OFFICIAL_KIT_MANIFEST);
    const sample = browser.kits[0].lanes.kick[0];

    expect(browser.labels.kitSelect).toBe("Official kit selection");
    expect(browser.labels.lane("kick")).toBe("Show kick samples");
    expect(browser.labels.preview(sample)).toBe("Preview Phyzikal Knock kick default");
  });
});
