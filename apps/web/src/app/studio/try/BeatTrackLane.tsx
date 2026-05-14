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
    <section className="min-h-[680px] overflow-y-auto overscroll-contain rounded-xl border border-green-300/20 bg-black/45 p-3 pr-2">
      <BeatTransport midi={midi} onAddTrack={onAddTrack} />
      <div className="grid min-h-[720px] grid-cols-[240px_1fr] gap-3">
        <BeatPadGrid pads={pads} activePad={activePad} onFirePad={onFirePad} />
        <VirtualTrackList tracks={tracks} rowHeight={124} height={620}>
          {(track, row) => (
            <BeatSequencerRow key={track.id} track={track} index={row} selected={selectedTrack === track.id} onSelect={() => onSelectTrack(track.id)} />
          )}
        </VirtualTrackList>
      </div>
    </section>
  );
}

export default memo(BeatTrackLane);
