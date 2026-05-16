"use client";

import { memo, useEffect, useMemo, useState } from "react";
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
const PAD_ASSIGNMENTS_STORAGE_KEY = "ems-studio-pad-assignments";
const PAD_ASSIGNMENT_ORDER = ["KICK", "SNARE", "CLAP", "HAT", "OPEN", "PERC", "808", "CRASH"];

type PadAssignment = { soundName: string; soundUrl: string; soundId: string };

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

function loadPadAssignments(): Record<string, PadAssignment> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PAD_ASSIGNMENTS_STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function dispatchTimelinePlacement(sound: StudioSoundAsset) {
  window.dispatchEvent(new CustomEvent("ems:studio-place-sound", { detail: { sound } }));
}

function inferPadLabel(sound: StudioSoundAsset) {
  const name = sound.name.toLowerCase();
  if (name.includes("kick")) return "KICK";
  if (name.includes("snare")) return "SNARE";
  if (name.includes("clap")) return "CLAP";
  if (name.includes("hat") || name.includes("hihat")) return "HAT";
  if (name.includes("open")) return "OPEN";
  if (name.includes("perc")) return "PERC";
  if (name.includes("808") || name.includes("bass")) return "808";
  if (name.includes("crash")) return "CRASH";
  return PAD_ASSIGNMENT_ORDER[0];
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
  const [padAssignments, setPadAssignments] = useState<Record<string, PadAssignment>>(loadPadAssignments);
  const [toast, setToast] = useState<string | null>(null);
  const activeKit = selectedKit ?? localKit;
  const activeInstrument = selectedInstrument ?? localInstrument;
  const activeSounds = sounds ?? localSounds;
  const visiblePads = useMemo(() => pads.map((pad) => {
    const assignment = padAssignments[pad.label];
    return assignment ? { ...pad, soundName: assignment.soundName, soundUrl: assignment.soundUrl } : pad;
  }), [padAssignments, pads]);

  function emit(message: string) {
    notify?.(message);
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  }

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
    dispatchTimelinePlacement(sound);
    emit(`Placed ${sound.name} at the playhead.`);
  }

  function handleAssignSoundToTrack(sound: StudioSoundAsset) {
    const padLabel = inferPadLabel(sound);
    const assignment = { soundName: sound.name, soundUrl: sound.url, soundId: sound.id };
    setPadAssignments((current) => {
      const next = { ...current, [padLabel]: assignment };
      if (typeof window !== "undefined") window.localStorage.setItem(PAD_ASSIGNMENTS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    onAssignSoundToTrack?.(sound);
    emit(`Assigned ${sound.name} to ${padLabel}.`);
  }

  function handleFirePad(kind: DrumKind, label: string) {
    const assignment = padAssignments[label];
    if (assignment) {
      const audio = new Audio(assignment.soundUrl);
      void audio.play().catch(() => undefined);
    } else {
      onFirePad(kind, label);
    }
  }

  return (
    <section className="relative h-full min-h-0 overflow-hidden rounded-xl border border-green-300/20 bg-black/45 p-2">
      {toast && (
        <div className="pointer-events-none absolute right-3 top-3 z-50 max-w-[320px] rounded-xl border border-cyan-300/35 bg-black/90 px-3 py-2 text-xs font-bold text-cyan-100 shadow-[0_0_24px_rgba(0,245,255,.18)]">
          {toast}
        </div>
      )}
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
          <BeatPadGrid pads={visiblePads} activePad={activePad} onFirePad={handleFirePad} />
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
