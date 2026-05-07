"use client";

import { useMemo, useState } from "react";

/**
 * Free Sample Library — curated CC0 / public-domain loops shipped
 * with the DAW. Zero royalty obligation, zero subscription, zero
 * gatekeeper. Sits next to the Loop Browser so producers can choose
 * between "free + unattributed" (this) and "EMS marketplace stems +
 * 2% to source artist" (Loop Browser).
 *
 * Files live in /public/samples/ and are streamed via the same
 * <audio>/AudioBuffer pipeline as user-uploaded audio.
 */

interface Sample {
  id: string;
  name: string;
  bpm: number;
  key?: string;
  category: "drums" | "bass" | "melody" | "fx" | "vocals";
  /** Path under /public — must be CC0 or otherwise unencumbered. */
  url: string;
}

// Curated starter pack. Treat this as an editable manifest — keep all
// entries actually CC0 / Creative Commons Zero so no rights surprises.
// Replace the placeholders with real audio when uploading the pack.
const SAMPLES: Sample[] = [
  { id: "kick-808-c1", name: "808 Kick · C1", bpm: 0, key: "C", category: "drums", url: "/samples/drums/808-kick-c1.wav" },
  { id: "snare-trap", name: "Trap Snare", bpm: 0, category: "drums", url: "/samples/drums/trap-snare.wav" },
  { id: "snare-clap", name: "Wet Clap", bpm: 0, category: "drums", url: "/samples/drums/wet-clap.wav" },
  { id: "hat-closed", name: "Closed Hat", bpm: 0, category: "drums", url: "/samples/drums/closed-hat.wav" },
  { id: "hat-open", name: "Open Hat", bpm: 0, category: "drums", url: "/samples/drums/open-hat.wav" },
  { id: "perc-shaker", name: "Shaker Loop", bpm: 90, category: "drums", url: "/samples/drums/shaker-90.wav" },
  { id: "drum-loop-90", name: "Lo-fi Drum Loop · 90 BPM", bpm: 90, category: "drums", url: "/samples/loops/drums-lofi-90.wav" },
  { id: "drum-loop-140", name: "Trap Drum Loop · 140 BPM", bpm: 140, category: "drums", url: "/samples/loops/drums-trap-140.wav" },

  { id: "bass-808-am", name: "808 Bass · A minor", bpm: 140, key: "Am", category: "bass", url: "/samples/bass/808-am.wav" },
  { id: "bass-sub", name: "Sub Bass · F", bpm: 90, key: "F", category: "bass", url: "/samples/bass/sub-f.wav" },
  { id: "bass-acid", name: "Acid Bass Loop · 120", bpm: 120, key: "Em", category: "bass", url: "/samples/bass/acid-em-120.wav" },

  { id: "melody-piano", name: "Piano Melody · A minor", bpm: 90, key: "Am", category: "melody", url: "/samples/melody/piano-am-90.wav" },
  { id: "melody-rhodes", name: "Rhodes Chord Loop", bpm: 80, key: "Cm", category: "melody", url: "/samples/melody/rhodes-cm-80.wav" },
  { id: "melody-pluck", name: "Plucked Synth Loop", bpm: 130, key: "Gm", category: "melody", url: "/samples/melody/pluck-gm-130.wav" },
  { id: "melody-pad", name: "Ambient Pad · D", bpm: 0, key: "D", category: "melody", url: "/samples/melody/pad-d.wav" },

  { id: "fx-riser", name: "Build-up Riser", bpm: 0, category: "fx", url: "/samples/fx/riser.wav" },
  { id: "fx-impact", name: "Cinematic Impact", bpm: 0, category: "fx", url: "/samples/fx/impact.wav" },
  { id: "fx-reverse", name: "Reverse Cymbal", bpm: 0, category: "fx", url: "/samples/fx/reverse-cymbal.wav" },
  { id: "fx-vinyl", name: "Vinyl Crackle", bpm: 0, category: "fx", url: "/samples/fx/vinyl-crackle.wav" },

  { id: "vox-aah", name: "Female Vocal · 'Aah'", bpm: 0, key: "C", category: "vocals", url: "/samples/vocals/aah-c.wav" },
  { id: "vox-yeah", name: "'Yeah' Adlib", bpm: 0, category: "vocals", url: "/samples/vocals/yeah.wav" },
];

const CATEGORIES: Array<{ key: Sample["category"] | "all"; label: string; emoji: string }> = [
  { key: "all", label: "All", emoji: "🎚" },
  { key: "drums", label: "Drums", emoji: "🥁" },
  { key: "bass", label: "Bass", emoji: "🔊" },
  { key: "melody", label: "Melody", emoji: "🎹" },
  { key: "fx", label: "FX", emoji: "✨" },
  { key: "vocals", label: "Vocals", emoji: "🎤" },
];

interface Props {
  onLoadSample: (args: { name: string; url: string; category: Sample["category"] }) => Promise<void>;
}

export default function SampleLibraryPanel({ onLoadSample }: Props) {
  const [filter, setFilter] = useState<Sample["category"] | "all">("all");
  const [recentLoad, setRecentLoad] = useState<string | null>(null);
  const visible = useMemo(
    () => (filter === "all" ? SAMPLES : SAMPLES.filter((s) => s.category === filter)),
    [filter],
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200/85">
            Sample Library · Free
          </p>
          <p className="mt-0.5 text-[11px] text-white/45">
            CC0 starter pack. Use freely. Zero royalty owed.
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setFilter(c.key)}
            className={`rounded-full border px-3 py-1 text-[11px] font-bold transition ${
              filter === c.key
                ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-200"
                : "border-white/10 bg-white/[0.03] text-white/55 hover:border-emerald-500/30 hover:text-white/85"
            }`}
          >
            <span className="mr-1">{c.emoji}</span>
            {c.label}
          </button>
        ))}
      </div>

      <div className="mt-3 grid max-h-[320px] gap-1.5 overflow-y-auto pr-1">
        {visible.map((s) => {
          const isRecent = recentLoad === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={async () => {
                setRecentLoad(s.id);
                await onLoadSample({ name: s.name, url: s.url, category: s.category });
                setTimeout(() => setRecentLoad(null), 1200);
              }}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-xs font-medium transition ${
                isRecent
                  ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-100"
                  : "border-white/10 bg-white/[0.02] text-white/80 hover:border-emerald-500/30 hover:bg-emerald-500/[0.04]"
              }`}
            >
              <span className="truncate">{s.name}</span>
              <span className="ml-3 flex-shrink-0 text-[10px] uppercase tracking-wider text-white/40">
                {isRecent ? "✓ loaded" : `${s.bpm ? `${s.bpm} BPM` : "one-shot"}${s.key ? ` · ${s.key}` : ""}`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
