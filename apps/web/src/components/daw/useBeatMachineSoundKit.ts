"use client";

import { useCallback, useMemo, useRef, useState, type ReactElement } from "react";
import { KitBrowser } from "./KitBrowser";
import type { SoundAsset } from "./soundKits";
import { getDefaultSoundKit, SOUND_KITS } from "./soundKits";
import { loadWaveformPreview } from "./sampleLoader";
import { previewSoundAsset, preloadSoundKit } from "./beatMachineRuntime";
import type { DrumKind } from "./beatMachine";

export interface BeatMachineSoundKitState {
  selectedKitId: string;
  selectedLane: DrumKind;
  selectedSoundId: string | null;
  waveformPeaks: number[] | null;
  setSelectedKitId: (kitId: string) => void;
  setSelectedLane: (lane: DrumKind) => void;
  previewSound: (sound: SoundAsset) => Promise<void>;
  preloadSelectedKit: () => Promise<void>;
  KitBrowserPanel: () => ReactElement;
}

export function useBeatMachineSoundKit(audioContext?: AudioContext | null, outputNode?: AudioNode | null): BeatMachineSoundKitState {
  const [selectedKitId, setSelectedKitId] = useState(getDefaultSoundKit().id);
  const [selectedLane, setSelectedLane] = useState<DrumKind>("kick");
  const [selectedSoundId, setSelectedSoundId] = useState<string | null>(null);
  const [waveformPeaks, setWaveformPeaks] = useState<number[] | null>(null);
  const latestPreviewId = useRef(0);

  const selectedKit = useMemo(
    () => SOUND_KITS.find((kit) => kit.id === selectedKitId) ?? getDefaultSoundKit(),
    [selectedKitId],
  );

  const previewSound = useCallback(async (sound: SoundAsset) => {
    setSelectedSoundId(sound.id);
    const requestId = latestPreviewId.current + 1;
    latestPreviewId.current = requestId;

    if (!audioContext) {
      setWaveformPeaks(null);
      return;
    }

    const peaks = await loadWaveformPreview(audioContext, sound);
    if (latestPreviewId.current === requestId) setWaveformPeaks(peaks);

    if (outputNode) {
      await previewSoundAsset(audioContext, outputNode, sound);
    }
  }, [audioContext, outputNode]);

  const preloadSelectedKit = useCallback(async () => {
    if (!audioContext) return;
    await preloadSoundKit(audioContext, selectedKit.id);
  }, [audioContext, selectedKit.id]);

  const KitBrowserPanel = useCallback(() => (
    <KitBrowser
      kits={SOUND_KITS}
      selectedKitId={selectedKit.id}
      selectedLane={selectedLane}
      waveformPeaks={waveformPeaks}
      onSelectKit={(kitId) => {
        setSelectedKitId(kitId);
        setSelectedSoundId(null);
        setWaveformPeaks(null);
      }}
      onPreviewSound={previewSound}
    />
  ), [previewSound, selectedKit.id, selectedLane, waveformPeaks]);

  return {
    selectedKitId: selectedKit.id,
    selectedLane,
    selectedSoundId,
    waveformPeaks,
    setSelectedKitId,
    setSelectedLane,
    previewSound,
    preloadSelectedKit,
    KitBrowserPanel,
  };
}
