"use client";

import Link from "next/link";
import { memo, useRef, useState } from "react";
import type { StudioTrackKind } from "./studioWorkstationTypes";
import type { useStudioMidiBridge } from "./useStudioMidiBridge";

type Props = {
  midi: ReturnType<typeof useStudioMidiBridge>;
  onAddTrack: (kind?: StudioTrackKind) => void;
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

const SOUND_KITS = ["Trap", "R&B", "Drill", "Boom Bap", "Afro", "Pop", "Cinematic"];

function BeatTransport({ midi, onAddTrack }: Props) {
  const [instrument, setInstrument] = useState(INSTRUMENTS[0]);
  const [kit, setKit] = useState(SOUND_KITS[0]);
  const [uploadedSounds, setUploadedSounds] = useState<string[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function handleSoundUpload(fileList: FileList | null) {
    const files = Array.from(fileList ?? []).filter((file) => file.type.startsWith("audio/"));
    if (!files.length) return;
    setUploadedSounds((current) => [...files.map((file) => file.name), ...current].slice(0, 8));
    const first = files[0];
    const previewUrl = URL.createObjectURL(first);
    if (audioRef.current) {
      audioRef.current.src = previewUrl;
      void audioRef.current.play().catch(() => undefined);
    }
  }

  return (
    <div className="mb-2 rounded-xl border border-white/10 bg-black/75 p-2 backdrop-blur">
      <audio ref={audioRef} className="hidden" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-green-200/70">Producer sounds</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="rounded-lg border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-cyan-100 hover:bg-cyan-300/15">
            Upload sounds
            <input
              type="file"
              accept="audio/*"
              multiple
              className="hidden"
              onChange={(event) => handleSoundUpload(event.target.files)}
            />
          </label>
          <Link href="/studio/beat-machine" className="rounded-lg border border-yellow-300/35 bg-yellow-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-yellow-100">Full Beat Machine</Link>
          <button type="button" onClick={midi.connect} className="rounded-lg border border-green-300/35 bg-green-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-green-100">MIDI {midi.status}</button>
        </div>
      </div>

      {midi.lastEvent && <p className="mt-2 text-[10px] uppercase tracking-widest text-white/45">Last MIDI: {midi.lastEvent}</p>}

      <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-[1fr_1fr_auto]">
        <label className="grid gap-1 text-[9px] font-black uppercase tracking-widest text-white/45">
          Instrument
          <select value={instrument} onChange={(event) => setInstrument(event.target.value)} className="rounded-lg border border-white/10 bg-[#101820] px-3 py-2 text-xs font-bold text-white outline-none focus:border-cyan-300/50">
            {INSTRUMENTS.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-[9px] font-black uppercase tracking-widest text-white/45">
          Sound kit
          <select value={kit} onChange={(event) => setKit(event.target.value)} className="rounded-lg border border-white/10 bg-[#101820] px-3 py-2 text-xs font-bold text-white outline-none focus:border-yellow-300/50">
            {SOUND_KITS.map((item) => <option key={item}>{item}</option>)}
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
          <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Loaded sound</span>
          <span className="truncate text-[10px] font-bold text-cyan-100">{instrument} · {kit}</span>
        </div>
        {uploadedSounds.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {uploadedSounds.map((sound) => (
              <span key={sound} className="max-w-[180px] truncate rounded-full border border-white/10 bg-black/35 px-2 py-1 text-[9px] text-white/55">{sound}</span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[10px] text-white/35">Upload WAV/MP3 samples here, then add a drum, bass, or melody track.</p>
        )}
      </div>
    </div>
  );
}

export default memo(BeatTransport);
