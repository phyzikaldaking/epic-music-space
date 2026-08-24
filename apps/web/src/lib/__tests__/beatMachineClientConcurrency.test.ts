import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  committed: {
    config: { kitId: "phyzikal-knock", sampleUrls: { kick: "https://assets.example/committed-kick.wav" } },
    configIdentity: "committed-a",
    generation: 1,
  } as {
    config: { kitId: string; sampleUrls: { kick: string } };
    configIdentity: string;
    generation: number;
  },
}));

vi.mock("@/lib/officialKits/beatMachinePlayback", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/officialKits/beatMachinePlayback")>();
  return {
    ...actual,
    createOfficialKitLoadTracker: () => ({
      select: (config: typeof testState.committed.config) => {
        testState.committed = { config, configIdentity: "candidate-b", generation: 2 };
        return 2;
      },
      current: () => testState.committed,
      commit: (config: typeof testState.committed.config) => {
        testState.committed = { config, configIdentity: "candidate-b", generation: 2 };
        return testState.committed;
      },
      isCurrent: () => true,
    }),
  };
});

import BeatMachineProClient from "@/app/studio/beat-machine/BeatMachineProClient";

describe("BeatMachineProClient official-kit commit boundary", () => {
  it("does not publish a candidate kit while React is only rendering it", () => {
    testState.committed = {
      config: { kitId: "phyzikal-knock", sampleUrls: { kick: "https://assets.example/committed-kick.wav" } },
      configIdentity: "committed-a",
      generation: 1,
    };

    renderToString(createElement(BeatMachineProClient, {
      officialKit: {
        kitId: "phyzikal-knock",
        sampleUrls: { kick: "https://assets.example/candidate-kick.wav" },
      },
    }));

    expect(testState.committed).toMatchObject({
      config: { sampleUrls: { kick: "https://assets.example/committed-kick.wav" } },
      configIdentity: "committed-a",
      generation: 1,
    });
  });
});
