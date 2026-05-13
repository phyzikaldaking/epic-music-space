"use client";

import type { SoundAsset, SoundKit } from "./soundKits";
import { getSoundsForEngineLane } from "./soundKits";
import type { DrumKind } from "./beatMachine";

interface KitBrowserProps {
  kits: SoundKit[];
  selectedKitId: string;
  selectedLane?: DrumKind;
  waveformPeaks?: number[] | null;
  onSelectKit: (kitId: string) => void;
  onPreviewSound?: (sound: SoundAsset) => void;
}

export function KitBrowser({ kits, selectedKitId, selectedLane = "kick", waveformPeaks, onSelectKit, onPreviewSound }: KitBrowserProps) {
  const selectedKit = kits.find((kit) => kit.id === selectedKitId) ?? kits[0];
  const laneSounds = selectedKit ? getSoundsForEngineLane(selectedKit, selectedLane) : [];

  return (
    <section className="rounded-2xl border border-white/10 bg-black/40 p-4 text-white shadow-2xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/50">EMS Sound Kits</p>
          <h3 className="text-lg font-semibold">{selectedKit?.name ?? "No kit selected"}</h3>
        </div>
        <select
          className="rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white outline-none"
          value={selectedKitId}
          onChange={(event) => onSelectKit(event.target.value)}
        >
          {kits.map((kit) => (
            <option key={kit.id} value={kit.id}>{kit.name}</option>
          ))}
        </select>
      </div>

      {selectedKit ? <p className="mb-4 text-sm text-white/60">{selectedKit.description}</p> : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {selectedKit?.genreTags.map((tag) => (
          <span key={tag} className="rounded-full border border-white/10 px-2 py-1 text-xs text-white/60">{tag}</span>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-12 items-end gap-1 rounded-xl border border-white/10 bg-zinc-950/70 p-3" aria-label="Waveform preview">
        {(waveformPeaks && waveformPeaks.length > 0 ? waveformPeaks : Array.from({ length: 32 }, () => 0.18)).map((peak, index) => (
          <div key={index} className="rounded-full bg-white/60" style={{ height: `${Math.max(8, Math.round(peak * 52))}px` }} />
        ))}
      </div>

      <div className="max-h-60 space-y-2 overflow-auto pr-1">
        {laneSounds.map((sound) => (
          <button
            key={sound.id}
            type="button"
            className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left hover:bg-white/[0.08]"
            onClick={() => onPreviewSound?.(sound)}
          >
            <span>
              <span className="block text-sm font-medium">{sound.name}</span>
              <span className="block text-xs text-white/50">{sound.type} · peak {sound.loudness.peakDb} dB · {sound.license.licenseType}</span>
            </span>
            <span className="text-xs uppercase tracking-[0.18em] text-white/40">Preview</span>
          </button>
        ))}
      </div>
    </section>
  );
}
