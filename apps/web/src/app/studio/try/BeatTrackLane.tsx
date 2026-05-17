"use client";

import Link from "next/link";
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
  onUpdateTrack?: (id: string, patch: Partial<StudioTrack>) => void;
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
const BEAT_STEMS_SESSION_KEY = "ems-studio-beat-stems-session";
const PAD_ASSIGNMENT_ORDER = ["KICK", "SNARE", "CLAP", "HAT", "OPEN", "PERC", "808", "CRASH"];

type PadAssignment = { soundName: string; soundUrl: string; soundId: string };

type CloudRestorePayload = {
  soundLibrary?: StudioSoundAsset[];
  padAssignments?: Record<string, PadAssignment>;
  selectedKit?: string | null;
  selectedInstrument?: string | null;
};

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

function trackKindForPad(label: string): StudioTrackKind {
  if (label === "808") return "bass";
  if (["KICK", "SNARE", "CLAP", "HAT", "OPEN", "PERC", "CRASH"].includes(label)) return "drum";
  return "audio";
}

function aiMixPatch(track: StudioTrack, index = 0): Partial<StudioTrack> {
  const name = `${track.name} ${track.kind}`.toLowerCase();
  if (name.includes("kick") || name.includes("drum")) return { volume: 84, pan: 0, meter: 86 };
  if (name.includes("808") || name.includes("bass")) return { volume: 76, pan: 0, meter: 74 };
  if (name.includes("snare") || name.includes("clap")) return { volume: 72, pan: 0, meter: 68 };
  if (name.includes("hat") || name.includes("open") || name.includes("perc")) return { volume: 56, pan: index % 2 ? 18 : -18, meter: 54 };
  if (name.includes("vocal") || name.includes("vox") || name.includes("lead")) return { volume: 82, pan: 0, meter: 80 };
  if (name.includes("fx")) return { volume: 48, pan: index % 2 ? 28 : -28, meter: 42 };
  if (name.includes("keys") || name.includes("melody") || name.includes("pad") || name.includes("instrument")) return { volume: 60, pan: index % 2 ? 14 : -14, meter: 54 };
  return { volume: 62, pan: index % 2 ? 8 : -8, meter: 52 };
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
  onUpdateTrack,
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

  function updateTrack(track: StudioTrack, patch: Partial<StudioTrack>) {
    onUpdateTrack?.(track.id, patch);
    if (!onUpdateTrack) emit("Track controls are ready, but this studio route needs the update bridge enabled.");
  }

  function aiMixTrack(track: StudioTrack, index: number) {
    const patch = aiMixPatch(track, index);
    updateTrack(track, patch);
    window.dispatchEvent(new CustomEvent("ems:studio-toast", { detail: { message: `AI mixed ${track.name}.` } }));
    emit(`AI mixed ${track.name}: gain, pan, and meter target adjusted.`);
  }

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(KIT_STORAGE_KEY, activeKit);
  }, [activeKit]);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(INSTRUMENT_STORAGE_KEY, activeInstrument);
  }, [activeInstrument]);

  useEffect(() => {
    function handleCloudRestore(event: Event) {
      const payload = (event as CustomEvent<CloudRestorePayload>).detail;
      if (Array.isArray(payload?.soundLibrary)) setLocalSounds(payload.soundLibrary);
      if (payload?.padAssignments && typeof payload.padAssignments === "object") setPadAssignments(payload.padAssignments);
      if (payload?.selectedKit) setLocalKit(safeStoredKit(payload.selectedKit));
      if (payload?.selectedInstrument) setLocalInstrument(payload.selectedInstrument);
      emit("Cloud studio sounds restored.");
    }
    window.addEventListener("ems:studio-cloud-restored", handleCloudRestore);
    return () => window.removeEventListener("ems:studio-cloud-restored", handleCloudRestore);
  }, []);

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

  function sendBeatStemsToSession() {
    const stems = PAD_ASSIGNMENT_ORDER.map((label, index) => {
      const assignment = padAssignments[label];
      return {
        id: `beat-stem-${label.toLowerCase()}-${Date.now()}-${index}`,
        label,
        name: assignment?.soundName ?? `${label} Stem`,
        soundUrl: assignment?.soundUrl,
        soundId: assignment?.soundId,
        kind: trackKindForPad(label),
        volume: label === "KICK" ? 84 : label === "808" ? 76 : label === "SNARE" || label === "CLAP" ? 72 : label === "HAT" || label === "OPEN" ? 56 : 62,
        pan: label === "HAT" ? 14 : label === "OPEN" ? -16 : label === "PERC" ? 20 : 0,
        mixTemplate: label === "KICK" ? "center punch" : label === "808" ? "mono tuned low end" : label === "SNARE" || label === "CLAP" ? "forward backbeat" : label === "HAT" || label === "OPEN" ? "wide controlled top" : "supporting percussion",
      };
    });
    window.localStorage.setItem(BEAT_STEMS_SESSION_KEY, JSON.stringify({ stems, kit: activeKit, instrument: activeInstrument, createdAt: new Date().toISOString() }));
    window.dispatchEvent(new CustomEvent("ems:beat-stems-to-session", { detail: { stems, kit: activeKit, instrument: activeInstrument, autoMix: true } }));
    stems.forEach((stem) => {
      onAddTrack(stem.kind);
      if (stem.soundUrl) {
        window.dispatchEvent(new CustomEvent("ems:studio-place-sound", { detail: { sound: { id: stem.soundId ?? stem.id, name: stem.name, url: stem.soundUrl, source: "upload", instrument: stem.label, category: stem.kind, createdAt: new Date().toISOString() }, confirm: true, source: "beat-stems" } }));
      }
    });
    emit(`Sent ${stems.length} beat stems to the session with an AI mix template.`);
  }

  return (
    <section className="relative h-full min-h-0 overflow-auto rounded-xl border border-green-300/20 bg-black/45 p-2">
      {toast && (
        <div className="pointer-events-none absolute right-3 top-3 z-50 max-w-[320px] rounded-xl border border-cyan-300/35 bg-black/90 px-3 py-2 text-xs font-bold text-cyan-100 shadow-[0_0_24px_rgba(0,245,255,.18)]">
          {toast}
        </div>
      )}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/55 px-3 py-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-green-200/70">Beat workspace</p>
          <p className="text-[10px] text-white/40">Pads, sound browser, sequencer, full piano roll, solo/mute, per-track AI mix, and beat-to-session stems.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={sendBeatStemsToSession} className="rounded-lg border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-cyan-100 hover:bg-cyan-300/15">
            Send Beat Stems To Session
          </button>
          <Link href="/studio/beat-machine#piano-roll" className="rounded-lg border border-green-300/35 bg-green-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-green-100 hover:bg-green-300/15">
            🎹 Open Piano Roll
          </Link>
        </div>
      </div>
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
      <div className="grid min-h-[420px] min-w-0 grid-cols-1 gap-2 overflow-auto xl:grid-cols-[210px_minmax(0,1fr)]">
        <div className="min-h-0 overflow-y-auto pr-1">
          <BeatPadGrid pads={visiblePads} activePad={activePad} onFirePad={handleFirePad} />
        </div>
        <div className="min-h-0 min-w-0 overflow-auto rounded-xl border border-white/10 bg-black/20 p-2">
          <VirtualTrackList tracks={tracks} rowHeight={144} height={560}>
            {(track, row) => (
              <BeatSequencerRow key={track.id} track={track} index={row} selected={selectedTrack === track.id} onSelect={() => onSelectTrack(track.id)} onUpdate={(patch) => updateTrack(track, patch)} onAiMix={() => aiMixTrack(track, row)} />
            )}
          </VirtualTrackList>
        </div>
      </div>
    </section>
  );
}

export default memo(BeatTrackLane);
