import { describe, expect, it } from "vitest";

import {
  createOfficialKitLoadTracker,
  createOfficialKitPlaybackConfig,
  officialKitPlaybackConfigIdentity,
  planGenerationSafePrint,
  resolveOfficialPadPlayback,
} from "@/lib/officialKits/beatMachinePlayback";
import { loadOfficialKitBrowser } from "@/lib/officialKits/beatMachine";
import { OFFICIAL_KIT_MANIFEST } from "@/lib/officialKits";

describe("official kit Beat Machine playback mapping", () => {
  it("maps Phyzikal Knock defaults to sequencer pads and applies its starter pattern", () => {
    const browser = loadOfficialKitBrowser(OFFICIAL_KIT_MANIFEST, {
      getAssetUrl: (record) => `https://assets.example/${record.assetId}.wav`,
    });
    const kit = browser.kits.find((candidate) => candidate.id === "phyzikal-knock")!;
    const config = createOfficialKitPlaybackConfig(kit);

    expect(config.kitId).toBe("phyzikal-knock");
    expect(config.sampleUrls.kick).toBe("https://assets.example/phyzikal-knock-kick-default.wav");
    expect(config.sampleUrls.bass).toBe("https://assets.example/phyzikal-knock-bass808-default.wav");
    expect(config.starterPattern?.kick).toEqual([0, 4, 8, 12]);
  });

  it("changes the default sample mapping when the user switches kits", () => {
    const browser = loadOfficialKitBrowser(OFFICIAL_KIT_MANIFEST, {
      getAssetUrl: (record) => `https://assets.example/${record.assetId}.wav`,
    });
    const phyzikal = createOfficialKitPlaybackConfig(browser.kits[0]);
    const drill = createOfficialKitPlaybackConfig(browser.kits.find((candidate) => candidate.id === "fort-kane-drill")!);

    expect(drill.sampleUrls.kick).toBe("https://assets.example/fort-kane-drill-kick-default.wav");
    expect(drill.sampleUrls.kick).not.toBe(phyzikal.sampleUrls.kick);
    expect(drill.starterPattern).toBeUndefined();
  });

  it("uses a decoded sample for playback and print, with synth fallback only after an unavailable sample", () => {
    const config = { kitId: "phyzikal-knock", sampleUrls: { kick: "https://assets.example/kick.wav" } };

    expect(resolveOfficialPadPlayback(config, "kick", true, false)).toEqual({ kind: "sample", url: "https://assets.example/kick.wav" });
    expect(resolveOfficialPadPlayback(config, "kick", false, false)).toEqual({ kind: "pending", url: "https://assets.example/kick.wav" });
    expect(resolveOfficialPadPlayback(config, "kick", false, true)).toEqual({ kind: "synth" });
    expect(resolveOfficialPadPlayback(config, "snare", false, false)).toEqual({ kind: "synth" });
  });

  it("rejects a stale sample result after a rapid kit switch", () => {
    const tracker = createOfficialKitLoadTracker();
    const phyzikalRequest = tracker.commit({ kitId: "phyzikal-knock", sampleUrls: {} });
    const drillRequest = tracker.commit({ kitId: "fort-kane-drill", sampleUrls: {} });

    expect(tracker.isCurrent(phyzikalRequest)).toBe(false);
    expect(tracker.isCurrent(drillRequest)).toBe(true);
  });

  it("publishes config and generation together only when selection commits", () => {
    const tracker = createOfficialKitLoadTracker();
    const phyzikal = { kitId: "phyzikal-knock", sampleUrls: { kick: "https://assets.example/phyzikal-kick.wav" } };
    const drill = { kitId: "fort-kane-drill", sampleUrls: { kick: "https://assets.example/drill-kick.wav" } };

    const phyzikalSelection = tracker.commit(phyzikal);
    phyzikal.sampleUrls.kick = "https://assets.example/mutated-after-commit.wav";
    const beforeDrillCommit = tracker.current();

    expect(beforeDrillCommit).toBe(phyzikalSelection);
    expect(beforeDrillCommit.config?.sampleUrls.kick).toBe("https://assets.example/phyzikal-kick.wav");

    const drillSelection = tracker.commit(drill);
    expect(tracker.isCurrent(phyzikalSelection)).toBe(false);
    expect(tracker.isCurrent(drillSelection)).toBe(true);
    expect(planGenerationSafePrint(drillSelection.config, drillSelection.generation, tracker.current().config, tracker.current().generation, 0)).toMatchObject({
      kitId: "fort-kane-drill",
      generation: drillSelection.generation,
      retry: false,
      forceSynthFallback: false,
    });
  });

  it("retries the current kit after a switch during print loading and never plans a pending render", () => {
    const phyzikal = { kitId: "phyzikal-knock", sampleUrls: { kick: "https://assets.example/phyzikal-kick.wav" } };
    const drill = { kitId: "fort-kane-drill", sampleUrls: { kick: "https://assets.example/drill-kick.wav" } };

    const retry = planGenerationSafePrint(phyzikal, 1, drill, 2, 0);
    expect(retry).toMatchObject({ kitId: "fort-kane-drill", generation: 2, retry: true, forceSynthFallback: false });

    const fallback = planGenerationSafePrint(drill, 2, drill, 3, 1);
    expect(fallback).toMatchObject({ kitId: "fort-kane-drill", generation: 3, retry: false, forceSynthFallback: true });
    expect(resolveOfficialPadPlayback(fallback.config, "kick", false, fallback.forceSynthFallback)).toEqual({ kind: "synth" });
  });

  it("does not accept a same-kit generation when the full sample configuration differs", () => {
    const captured = { kitId: "phyzikal-knock", sampleUrls: { kick: "https://assets.example/kick-a.wav" } };
    const committed = { kitId: "phyzikal-knock", sampleUrls: { kick: "https://assets.example/kick-b.wav" } };

    const retry = planGenerationSafePrint(captured, 4, committed, 4, 0);
    expect(retry).toMatchObject({
      config: committed,
      retry: true,
      forceSynthFallback: false,
    });

    const fallback = planGenerationSafePrint(captured, 4, committed, 4, 1);
    expect(fallback).toMatchObject({ config: committed, retry: false, forceSynthFallback: true });
    expect(resolveOfficialPadPlayback(fallback.config, "kick", false, fallback.forceSynthFallback)).toEqual({ kind: "synth" });
  });

  it("identifies the complete playback config independent of object key order", () => {
    const first = {
      kitId: "phyzikal-knock",
      sampleUrls: { kick: "https://assets.example/kick.wav", snare: "https://assets.example/snare.wav" },
      starterPattern: { kick: [0, 4], snare: [4] },
    };
    const reordered = {
      kitId: "phyzikal-knock",
      sampleUrls: { snare: "https://assets.example/snare.wav", kick: "https://assets.example/kick.wav" },
      starterPattern: { snare: [4], kick: [0, 4] },
    };

    expect(officialKitPlaybackConfigIdentity(first)).toBe(officialKitPlaybackConfigIdentity(reordered));
    expect(officialKitPlaybackConfigIdentity({ ...first, sampleUrls: { ...first.sampleUrls, kick: "https://assets.example/replaced.wav" } }))
      .not.toBe(officialKitPlaybackConfigIdentity(first));
    expect(officialKitPlaybackConfigIdentity({ ...first, starterPattern: { ...first.starterPattern, kick: [0, 8] } }))
      .not.toBe(officialKitPlaybackConfigIdentity(first));
  });
});
