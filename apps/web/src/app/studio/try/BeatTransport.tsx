"use client";

import Link from "next/link";
import { memo, useRef, useState } from "react";
import type { DrumKitId } from "@/components/daw/beatMachine";
import type { StudioSoundAsset, StudioTrackKind } from "./studioWorkstationTypes";
import type { useStudioMidiBridge } from "./useStudioMidiBridge";

type Props = {
  midi: ReturnType<typeof useStudioMidiBridge>;
  selectedKit: DrumKitId;
  selectedInstrument: string;
  sounds: StudioSoundAsset[];
  onKitChange: (kit: DrumKitId) => void;
  onInstrumentChange: (instrument: string) => void;
  onSoundUploaded: (sound: StudioSoundAsset) => void;
  onAddTrack: (kind?: StudioTrackKind) => void;
  onDropSoundOnTimeline: (sound: StudioSoundAsset) => void;
  onAssignSoundToTrack: (sound: StudioSoundAsset) => void;
  notify: (message: string) => void;
};

const INSTRUMENTS = [
  "Trap Drums",
  "808 Bass",
  "Grand Piano",
  "Electric Keys",
  "Synth Lead",
  "Dark Pad",
  "Strings",
  "Brass Hit",
  "Vocal Chop",
  "FX Riser",
];

const SOUND_KITS: { label: string; value: DrumKitId }[] = [
  { label: "Trap", value: "trap" },
  { label: "Drill", value: "drill" },
  { label: "Afro", value: "afro" },
  { label: "Hyperpop", value: "hyperpop" },
  { label: "Boom Bap", value: "boomBap" },
  { label: "Lo-Fi", value: "lofi" },
  { label: "Acoustic", value: "acoustic" },
];

function BeatTransport({
  midi,
  selectedKit,
  selectedInstrument,
  sounds,
  onKitChange,
  onInstrumentChange,
  onSoundUploaded,
  onAddTrack,
  onDropSoundOnTimeline,
  onAssignSoundToTrack,
  notify,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function handleSoundUpload(fileList: FileList | null) {
    const files = Array.from(fileList ?? []).filter((file) => file.type.startsWith("audio/"));
    if (!files.length) {
      notify("Choose an audio file first.");
      return;
    }

    setUploading(true);
    try {
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        form.append("kit", selectedKit);
        form.append("instrument", selectedInstrument);

        const res = await fetch("/api/studio/sounds/upload", { method: "POST", body: form });
        if (res.ok) {
          const data = await res.json();
          onSoundUploaded(data.sound as StudioSoundAsset);
          notify(`Uploaded ${file.name}`);
        } else {
          const fallbackUrl = URL.createObjectURL(file);
          onSoundUploaded({
            id: `local-${Date.now()}-${file.name}`,
            name: file.name,
            url: fallbackUrl,
            source: "upload",
            kit: selectedKit,
            instrument: selectedInstrument,
            createdAt: new Date().toISOString(),
          });
          notify(`Loaded ${file.name} locally. Cloud upload is unavailable.`);
        }
      }
    } catch {
      notify("Sound upload failed. The studio kept running safely.");
    } finally {
      setUploading(false);
    }
  }

  function previewSound(sound: StudioSoundAsset) {
    if (!audioRef.current) return;
    audioRef.current.src = sound.url;
    void audioRef.current.play().catch(() => notify("Preview could not play this sound."));
  }

  return (
    <div className="mb-2 rounded-xl border border-white/10 bg-black/75 p-2 backdrop-blur">
      <audio ref={audioRef} className="hidden" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-green-200/70">Producer sounds</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="rounded-lg border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-cyan-100 hover:bg-cyan-300/15">
            {uploading ? "Uploading..." : "Upload sounds"}
            <input
              type="file"
              accept="audio/*"
              multiple
              className="hidden"
              onChange={(event) => handleSoundUpload(event.target.files)}
            />
          </label>
          <Link href="/studio/beat-machine" className="rounded-lg border border-yellow-300/35 bg-yellow-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-yellow-100">Full Beat Machine</Link>
          <button type="button" onClick={() => { void midi.connect(); notify("MIDI connect requested."); }} className="rounded-lg border border-green-300/35 bg-green-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-green-100">MIDI {midi.status}</button>
        </div>
      </div>

      {midi.lastEvent && <p className="mt-2 text-[10px] uppercase tracking-widest text-white/45">Last MIDI: {midi.lastEvent}</p>}

      <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-[1fr_1fr_auto]">
        <label className="grid gap-1 text-[9px] font-black uppercase tracking-widest text-white/45">
          Instrument
          <select value={selectedInstrument} onChange={(event) => onInstrumentChange(event.target.value)} className="rounded-lg border border-white/10 bg-[#101820] px-3 py-2 text-xs font-bold text-white outline-none focus:border-cyan-300/50">
            {INSTRUMENTS.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-[9px] font-black uppercase tracking-widest text-white/45">
          Sound kit
          <select value={selectedKit} onChange={(event) => onKitChange(event.target.value as DrumKitId)} className="rounded-lg border border-white/10 bg-[#101820] px-3 py-2 text-xs font-bold text-white outline-none focus:border-yellow-300/50">
            {SOUND_KITS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-2 self-end">
          <button type="button" onClick={() => onAddTrack("drum")} className="rounded-lg border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-[10px] font-black uppercase text-cyan-100">+ Drum</button>
          <button type="button" onClick={() => onAddTrack("bass")} className="rounded-lg border border-yellow-300/35 bg-yellow-300/10 px-3 py-2 text-[10px] font-black uppercase text-yellow-100">+ Bass</button>
          <button type="button" onClick={() => onAddTrack("melody")} className="rounded-lg border border-green-300/35 bg-green-300/10 px-3 py-2 text-[10px] font-black uppercase text-green-100">+ Melody</button>
        </div>
      </div>

      <div className="mt-2 rounded-lg border border-white/10 bg-white/[.03] p-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Sound browser</span>
          <span className="truncate text-[10px] font-bold text-cyan-100">{selectedInstrument} · {SOUND_KITS.find((kit) => kit.value === selectedKit)?.label ?? selectedKit}</span>
        </div>
        {sounds.length > 0 ? (
          <div className="mt-2 grid max-h-24 gap-1 overflow-y-auto pr-1">
            {sounds.map((sound) => (
              <div
                key={sound.id}
                draggable
                onDragStart={(event) => event.dataTransfer.setData("application/x-ems-sound", sound.id)}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-1 rounded-lg border border-white/10 bg-black/35 px-2 py-1 text-[10px] text-white/65"
              >
                <span className="truncate">{sound.name}</span>
                <button type="button" onClick={() => previewSound(sound)} className="rounded border border-cyan-300/30 px-2 py-1 text-cyan-100">Play</button>
                <button type="button" onClick={() => onAssignSoundToTrack(sound)} className="rounded border border-yellow-300/30 px-2 py-1 text-yellow-100">Assign</button>
                <button type="button" onClick={() => onDropSoundOnTimeline(sound)} className="rounded border border-green-300/30 px-2 py-1 text-green-100">Place</button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[10px] text-white/35">Upload WAV/MP3 samples, preview them, assign them to a track, or place them on the timeline.</p>
        )}
      </div>
    </div>
  );
}

export default memo(BeatTransport);
