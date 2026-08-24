"use client";

import { useCallback, useState } from "react";

import { createOfficialKitPlaybackConfig, type OfficialKitPlaybackConfig } from "@/lib/officialKits/beatMachinePlayback";
import type { OfficialKitAssetUrlOptions, OfficialKitBrowserKit } from "@/lib/officialKits/beatMachine";

import BeatMachineProClient from "./BeatMachineProClient";
import { OfficialKitBrowser } from "./OfficialKitBrowser";

/** Route-level composition leaves the established sequencer, playback,
 * exporting, and Studio-print workflow intact while adding the official kit
 * loader as a separately testable browser surface. */
interface OfficialKitBeatMachineStudioProps extends OfficialKitAssetUrlOptions {
  loadManifest?: () => Promise<unknown>;
  manifest?: unknown;
}

export default function OfficialKitBeatMachineStudio({ getAssetUrl, loadManifest, manifest }: OfficialKitBeatMachineStudioProps) {
  const [officialKit, setOfficialKit] = useState<OfficialKitPlaybackConfig>();
  const selectOfficialKit = useCallback((kit: OfficialKitBrowserKit) => {
    setOfficialKit(createOfficialKitPlaybackConfig(kit));
  }, []);

  return <div className="flex h-[100dvh] min-h-0 flex-col bg-[#0b0d10]">
    <OfficialKitBrowser getAssetUrl={getAssetUrl} loadManifest={loadManifest} manifest={manifest} onKitChange={selectOfficialKit} />
    <div className="min-h-0 flex-1">
      <BeatMachineProClient studioMode officialKit={officialKit} />
    </div>
  </div>;
}
