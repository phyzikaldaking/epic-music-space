"use client";

import { memo } from "react";
import BeatPadGrid from "./BeatPadGrid";
import BeatSequencerRow from "./BeatSequencerRow";
import BeatTransport from "./BeatTransport";
import VirtualTrackList from "./VirtualTrackList";
import type { DrumKind } from "@/components/daw/beatMachine";
import type { StudioMidiBridge, StudioPad, StudioTrack, StudioTrackKind } from "./studioWorkstationTypes";

type Props = {
  tracks: StudioTrack[];
  pads: StudioPad[];
  activePad: string | null;
  selectedTrack: string;
  midi: StudioMidiBridge;
  onFirePad: (kind: DrumKind, label: string) => void;
  onAddTrack: (kind?: StudioTrackKind) => void;
  onSelectTrack: (id: string) => void;
};

function BeatTrackLane({ tracks, pads, activePad, selectedTrack, midi, onFirePad, onAddTrack, onSelectTrack }: Props) {
  return (
    <section className="h-full min-h-0 overflow-hidden rounded-xl border border-green-300/20 bg-black/45 p-2">
      <BeatTransport midi={midi} onAddTrack={onAddTrack} />
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
