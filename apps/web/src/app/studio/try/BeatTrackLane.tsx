"use client";

import { memo } from "react";
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
  selectedKit: DrumKitId;
  selectedInstrument: string;
  sounds: StudioSoundAsset[];
  midi: StudioMidiBridge;
  onFirePad: (kind: DrumKind, label: string) => void;
  onAddTrack: (kind?: StudioTrackKind) => void;
  onSelectTrack: (id: string) => void;
  onKitChange: (kit: DrumKitId) => void;
  onInstrumentChange: (instrument: string) => void;
  onSoundUploaded: (sound: StudioSoundAsset) => void;
  onDropSoundOnTimeline: (sound: StudioSoundAsset) => void;
  onAssignSoundToTrack: (sound: StudioSoundAsset) => void;
  notify: (message: string) => void;
};

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
  return (
    <section className="h-full min-h-0 overflow-hidden rounded-xl border border-green-300/20 bg-black/45 p-2">
      <BeatTransport
        midi={midi}
        selectedKit={selectedKit}
        selectedInstrument={selectedInstrument}
        sounds={sounds}
        onKitChange={onKitChange}
        onInstrumentChange={onInstrumentChange}
        onSoundUploaded={onSoundUploaded}
        onAddTrack={onAddTrack}
        onDropSoundOnTimeline={onDropSoundOnTimeline}
        onAssignSoundToTrack={onAssignSoundToTrack}
        notify={notify}
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
