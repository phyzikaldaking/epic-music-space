"use client";

import { memo, useEffect, useState } from "react";
import BeatPadGrid from "./BeatPadGrid";
import BeatSequencerRow from "./BeatSequencerRow";
import BeatTransport from "./BeatTransport";
import VirtualTrackList from "./VirtualTrackList";
import type { DrumKind, DrumKitId } from "@/components/daw/beatMachine";
import type { StudioMidiBridge, StudioPad, StudioSoundAsset, StudioTrack, StudioTrackKind } from "./studioWorkstationTypes";

type Props = {
  tracks: StudioTrack[];
  pads: StudioPad[];
  activePad: string | null;
  selectedTrack: string;
  selectedKit?: DrumKitId;
  selectedInstrument?: string;
  sounds?: StudioSoundAsset[];
  midi: StudioMidiBridge;
  onFirePad: (kind: DrumKind, label: string) => void;
  onAddTrack: (kind?: StudioTrackKind) => void;
  onSelectTrack: (id: string) => void;
  onKitChange?: (kit: DrumKitId) => void;
  onInstrumentChange?: (instrument: string) => void;
  onSoundUploaded?: (sound: StudioSoundAsset) => void;
  onDropSoundOnTimeline?: (sound: StudioSoundAsset) => void;
  onAssignSoundToTrack?: (sound: StudioSoundAsset) => void;
  notify?: (message: string) => void;
};

const KIT_STORAGE_KEY = "ems-studio-selected-kit";
const INSTRUMENT_STORAGE_KEY = "ems-studio-selected-instrument";
const SOUNDS_STORAGE_KEY = "ems-studio-sounds";

function safeStoredKit(value: string | null): DrumKitId {
  const valid = ["trap", "drill", "afro", "hyperpop", "boomBap", "lofi", "acoustic"] as const;
  return valid.includes(value as DrumKitId) ? (value as DrumKitId) : "trap";
}

function loadStoredSounds(): StudioSoundAsset[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SOUNDS_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function BeatTrackLane({
  tracks,
  pads,
  activePad,
  selectedTrack,
  selectedKit,
  selectedInstrument,
  sounds,
  midi,
  onFirePad,
  onAddTrack,
  onSelectTrack,
  onKitChange,
  onInstrumentChange,
  onSoundUploaded,
  onDropSoundOnTimeline,
  onAssignSoundToTrack,
  notify,
}: Props) {
  const [localKit, setLocalKit] = useState<DrumKitId>(() => safeStoredKit(typeof window !== "undefined" ? window.localStorage.getItem(KIT_STORAGE_KEY) : null));
  const [localInstrument, setLocalInstrument] = useState(() => typeof window !== "undefined" ? window.localStorage.getItem(INSTRUMENT_STORAGE_KEY) || "Trap Drums" : "Trap Drums");
  const [localSounds, setLocalSounds] = useState<StudioSoundAsset[]>(loadStoredSounds);
  const activeKit = selectedKit ?? localKit;
  const activeInstrument = selectedInstrument ?? localInstrument;
  const activeSounds = sounds ?? localSounds;
  const emit = notify ?? (() => undefined);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(KIT_STORAGE_KEY, activeKit);
  }, [activeKit]);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(INSTRUMENT_STORAGE_KEY, activeInstrument);
  }, [activeInstrument]);

  function handleKitChange(kit: DrumKitId) {
    setLocalKit(kit);
    if (typeof window !== "undefined") window.localStorage.setItem(KIT_STORAGE_KEY, kit);
    onKitChange?.(kit);
    emit(`Sound kit changed to ${kit}.`);
  }

  function handleInstrumentChange(instrument: string) {
    setLocalInstrument(instrument);
    if (typeof window !== "undefined") window.localStorage.setItem(INSTRUMENT_STORAGE_KEY, instrument);
    onInstrumentChange?.(instrument);
    emit(`Instrument changed to ${instrument}.`);
  }

  function handleSoundUploaded(sound: StudioSoundAsset) {
    setLocalSounds((current) => {
      const next = [sound, ...current.filter((item) => item.id !== sound.id)].slice(0, 32);
      if (typeof window !== "undefined") window.localStorage.setItem(SOUNDS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    onSoundUploaded?.(sound);
  }

  function handleDropSoundOnTimeline(sound: StudioSoundAsset) {
    onDropSoundOnTimeline?.(sound);
    emit(`Placed ${sound.name} at the playhead.`);
  }

  function handleAssignSoundToTrack(sound: StudioSoundAsset) {
    onAssignSoundToTrack?.(sound);
    emit(`Assigned ${sound.name} to selected track.`);
  }

  return (
    <section className="h-full min-h-0 overflow-hidden rounded-xl border border-green-300/20 bg-black/45 p-2">
      <BeatTransport
        midi={midi}
        selectedKit={activeKit}
        selectedInstrument={activeInstrument}
        sounds={activeSounds}
        onKitChange={handleKitChange}
        onInstrumentChange={handleInstrumentChange}
        onSoundUploaded={handleSoundUploaded}
        onAddTrack={onAddTrack}
        onDropSoundOnTimeline={handleDropSoundOnTimeline}
        onAssignSoundToTrack={handleAssignSoundToTrack}
        notify={emit}
      />
      <div className="grid h-[calc(100%-180px)] min-h-[420px] min-w-0 grid-cols-1 gap-2 overflow-hidden xl:grid-cols-[210px_minmax(0,1fr)]">
        <div className="min-h-0 overflow-y-auto pr-1">
          <BeatPadGrid pads={pads} activePad={activePad} onFirePad={onFirePad} />
        </div>
        <div className="min-h-0 min-w-0 overflow-hidden rounded-xl border border-white/10 bg-black/20 p-2">
          <VirtualTrackList tracks={tracks} rowHeight={104} height={520}>
            {(track, row) => (
              <BeatSequencerRow key={track.id} track={track} index={row} selected={selectedTrack === track.id} onSelect={() => onSelectTrack(track.id)} />
            )}
          </VirtualTrackList>
        </div>
      </div>
    </section>
  );
}

export default memo(BeatTrackLane);
