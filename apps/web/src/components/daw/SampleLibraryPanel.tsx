"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { useStudioContext } from "@/lib/studioContextStore";

/**
 * Sample Library — Supabase audio-assets first, local starter pack
 * fallback. Sits next to the Loop Browser so producers can choose
 * between EMS-owned sample assets and marketplace stems.
 *
 * Files stream through the same <audio>/AudioBuffer pipeline as
 * user-uploaded audio.
 */

interface Sample {
  id: string;
  name: string;
  bpm: number;
  key?: string;
  category: "drums" | "bass" | "melody" | "fx" | "vocals";
  /** Supabase public URL or local fallback path. */
  url: string;
  source: "supabase" | "fallback";
}

interface RemoteSound {
  id?: string;
  name?: string;
  url?: string;
  category?: string;
  bpm?: number;
  key?: string;
}

// Local fallback only. The live library is loaded from the Supabase
// audio-assets bucket through /api/studio/sounds/library.
const FALLBACK_SAMPLES: Sample[] = [
  { id: "kick-808-c1", name: "808 Kick · C1", bpm: 0, key: "C", category: "drums", url: "/samples/drums/808-kick-c1.wav", source: "fallback" },
  { id: "snare-trap", name: "Trap Snare", bpm: 0, category: "drums", url: "/samples/drums/trap-snare.wav", source: "fallback" },
  { id: "snare-clap", name: "Wet Clap", bpm: 0, category: "drums", url: "/samples/drums/wet-clap.wav", source: "fallback" },
  { id: "hat-closed", name: "Closed Hat", bpm: 0, category: "drums", url: "/samples/drums/closed-hat.wav", source: "fallback" },
  { id: "hat-open", name: "Open Hat", bpm: 0, category: "drums", url: "/samples/drums/open-hat.wav", source: "fallback" },
  { id: "perc-shaker", name: "Shaker Loop", bpm: 90, category: "drums", url: "/samples/drums/shaker-90.wav", source: "fallback" },
  { id: "drum-loop-90", name: "Lo-fi Drum Loop · 90 BPM", bpm: 90, category: "drums", url: "/samples/loops/drums-lofi-90.wav", source: "fallback" },
  { id: "drum-loop-140", name: "Trap Drum Loop · 140 BPM", bpm: 140, category: "drums", url: "/samples/loops/drums-trap-140.wav", source: "fallback" },

  { id: "bass-808-am", name: "808 Bass · A minor", bpm: 140, key: "Am", category: "bass", url: "/samples/bass/808-am.wav", source: "fallback" },
  { id: "bass-sub", name: "Sub Bass · F", bpm: 90, key: "F", category: "bass", url: "/samples/bass/sub-f.wav", source: "fallback" },
  { id: "bass-acid", name: "Acid Bass Loop · 120", bpm: 120, key: "Em", category: "bass", url: "/samples/bass/acid-em-120.wav", source: "fallback" },

  { id: "melody-piano", name: "Piano Melody · A minor", bpm: 90, key: "Am", category: "melody", url: "/samples/melody/piano-am-90.wav", source: "fallback" },
  { id: "melody-rhodes", name: "Rhodes Chord Loop", bpm: 80, key: "Cm", category: "melody", url: "/samples/melody/rhodes-cm-80.wav", source: "fallback" },
  { id: "melody-pluck", name: "Plucked Synth Loop", bpm: 130, key: "Gm", category: "melody", url: "/samples/melody/pluck-gm-130.wav", source: "fallback" },
  { id: "melody-pad", name: "Ambient Pad · D", bpm: 0, key: "D", category: "melody", url: "/samples/melody/pad-d.wav", source: "fallback" },

  { id: "fx-riser", name: "Build-up Riser", bpm: 0, category: "fx", url: "/samples/fx/riser.wav", source: "fallback" },
  { id: "fx-impact", name: "Cinematic Impact", bpm: 0, category: "fx", url: "/samples/fx/impact.wav", source: "fallback" },
  { id: "fx-reverse", name: "Reverse Cymbal", bpm: 0, category: "fx", url: "/samples/fx/reverse-cymbal.wav", source: "fallback" },
  { id: "fx-vinyl", name: "Vinyl Crackle", bpm: 0, category: "fx", url: "/samples/fx/vinyl-crackle.wav", source: "fallback" },

  { id: "vox-aah", name: "Female Vocal · 'Aah'", bpm: 0, key: "C", category: "vocals", url: "/samples/vocals/aah-c.wav", source: "fallback" },
  { id: "vox-yeah", name: "'Yeah' Adlib", bpm: 0, category: "vocals", url: "/samples/vocals/yeah.wav", source: "fallback" },
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

/** ±5% tolerance — anything within this range plays well enough at the
 *  project tempo without needing time-stretch. */
const BPM_MATCH_TOLERANCE = 0.05;

export default function SampleLibraryPanel({ onLoadSample }: Props) {
  const [filter, setFilter] = useState<Sample["category"] | "all">("all");
  const [samples, setSamples] = useState<Sample[]>(FALLBACK_SAMPLES);
  const [libraryBackend, setLibraryBackend] = useState<"loading" | "supabase" | "fallback">("loading");
  const [recentLoad, setRecentLoad] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const studioContext = useStudioContext();
  const projectBpm = studioContext.bpm;
  const projectKey = studioContext.projectKey;
  const visible = useMemo(
    () => (filter === "all" ? samples : samples.filter((s) => s.category === filter)),
    [filter, samples],
  );

  // Hover-preview pipeline. We keep a single AudioContext + a per-URL
  // buffer cache so flicking the mouse across the list doesn't trigger a
  // network fetch + decode for every sample. The 200ms debounce stops
  // pass-through hovers from firing.
  const ctxRef = useRef<AudioContext | null>(null);
  const bufferCacheRef = useRef<Map<string, AudioBuffer | "missing">>(new Map());
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadSupabaseSamples() {
      try {
        const response = await fetch("/api/studio/sounds/library?limit=1000", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Sample library request failed: ${response.status}`);
        const payload = (await response.json()) as { sounds?: RemoteSound[] };
        const remoteSamples = (payload.sounds ?? []).map(remoteSoundToSample).filter(Boolean) as Sample[];
        if (remoteSamples.length === 0) throw new Error("Supabase audio-assets bucket is empty.");
        setSamples(remoteSamples);
        setLibraryBackend("supabase");
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn("EMS sample library using local fallback samples", error);
        setSamples(FALLBACK_SAMPLES);
        setLibraryBackend("fallback");
      }
    }

    void loadSupabaseSamples();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
      try {
        sourceRef.current?.stop();
      } catch {
        // ignore
      }
    };
  }, []);

  function getCtx(): AudioContext | null {
    if (ctxRef.current) return ctxRef.current;
    const Ctor =
      typeof window === "undefined"
        ? null
        : window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctxRef.current = new Ctor({ latencyHint: "interactive" });
      return ctxRef.current;
    } catch {
      return null;
    }
  }

  async function previewSample(sample: Sample) {
    const ctx = getCtx();
    if (!ctx) return;
    const cached = bufferCacheRef.current.get(sample.url);
    let buffer: AudioBuffer | null = null;
    if (cached === "missing") {
      // Already failed once — don't retry on every hover.
      return;
    }
    if (cached) {
      buffer = cached;
    } else {
      try {
        const res = await fetch(sample.url);
        if (!res.ok) throw new Error("404");
        const arr = await res.arrayBuffer();
        buffer = await ctx.decodeAudioData(arr);
        bufferCacheRef.current.set(sample.url, buffer);
      } catch {
        bufferCacheRef.current.set(sample.url, "missing");
        return;
      }
    }
    if (!buffer) return;
    // Stop the previous preview before starting a new one.
    try {
      sourceRef.current?.stop();
    } catch {
      // ignore — already stopped
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    src.connect(gain).connect(ctx.destination);
    // Cap preview at 1.5s so a long loop doesn't hold the user hostage.
    src.start(0, 0, Math.min(1.5, buffer.duration));
    sourceRef.current = src;
    setPreviewing(sample.id);
    src.onended = () => setPreviewing((cur) => (cur === sample.id ? null : cur));
  }

  function onSampleHover(sample: Sample) {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      void previewSample(sample);
    }, 200);
  }

  function onSampleLeave() {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    try {
      sourceRef.current?.stop();
    } catch {
      // ignore
    }
    setPreviewing(null);
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200/85">
            Sample Library · {libraryBackend === "supabase" ? "Audio Assets" : "Free"}
          </p>
          <p className="mt-0.5 text-[11px] text-white/45">
            {libraryBackend === "loading"
              ? "Loading Supabase audio assets..."
              : libraryBackend === "supabase"
                ? `${samples.length} Supabase audio-assets ready to preview and load.`
                : "Local starter pack fallback. Supabase audio assets unavailable."}
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

      {(projectBpm != null || projectKey) && (
        <p className="mt-2 text-[10px] uppercase tracking-widest text-white/40">
          Project at {projectBpm ?? "?"} BPM
          {projectKey ? ` · key ${projectKey}` : ""} — matches highlighted in green.
        </p>
      )}
      <div className="mt-3 grid max-h-[320px] gap-1.5 overflow-y-auto pr-1">
        {visible.map((s) => {
          const isRecent = recentLoad === s.id;
          const isPreviewing = previewing === s.id;
          // BPM matching (#14). One-shots (s.bpm === 0) are tempo-agnostic.
          const bpmMatch =
            projectBpm != null &&
            s.bpm > 0 &&
            Math.abs(s.bpm - projectBpm) / projectBpm <= BPM_MATCH_TOLERANCE;
          // Key matching (#24). True when the sample's key is the same
          // letter+accidental as the project key, ignoring the m/maj
          // suffix (a C-minor loop is musically compatible with a C
          // major track on most beats, and producers treat them as a
          // match for sampling purposes).
          const keyMatch = projectKey != null && s.key
            ? sameKeyRoot(projectKey, s.key)
            : false;
          const matches = bpmMatch || keyMatch;
          const offTempo =
            projectBpm != null && s.bpm > 0 && !bpmMatch && !keyMatch;
          return (
            <button
              key={s.id}
              type="button"
              onMouseEnter={() => onSampleHover(s)}
              onMouseLeave={onSampleLeave}
              onClick={async () => {
                onSampleLeave();
                setRecentLoad(s.id);
                await onLoadSample({ name: s.name, url: s.url, category: s.category });
                setTimeout(() => setRecentLoad(null), 1200);
              }}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-xs font-medium transition ${
                isRecent
                  ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-100"
                  : isPreviewing
                    ? "border-tube-300/55 bg-tube-300/10 text-white"
                    : matches
                      ? "border-emerald-400/45 bg-emerald-500/10 text-emerald-100"
                      : offTempo
                        ? "border-white/5 bg-white/[0.01] text-white/40 hover:text-white/65"
                        : "border-white/10 bg-white/[0.02] text-white/80 hover:border-emerald-500/30 hover:bg-emerald-500/[0.04]"
              }`}
            >
              <span className="truncate">{s.name}</span>
              <span className="ml-3 flex flex-shrink-0 items-center gap-1.5 text-[10px] uppercase tracking-wider">
                {bpmMatch && (
                  <span className="rounded bg-emerald-500/30 px-1 py-0.5 font-bold text-emerald-100">
                    ✓ bpm
                  </span>
                )}
                {keyMatch && (
                  <span className="rounded bg-cyan-500/30 px-1 py-0.5 font-bold text-cyan-100">
                    ♪ key
                  </span>
                )}
                <span className={matches ? "text-emerald-200/85" : "text-white/40"}>
                  {isRecent
                    ? "✓ loaded"
                    : isPreviewing
                      ? "▶ preview"
                      : `${s.bpm ? `${s.bpm} BPM` : "one-shot"}${s.key ? ` · ${s.key}` : ""}`}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Strip the `m` / `maj` / minor-7 suffix from a key string and normalize
// flats to sharps so "Bb" and "A#" both reduce to "A#". Returns just the
// root pitch class. Comparison is letter-for-letter — sharp/flat
// equivalents collapse via normalization.
function rootPitchClass(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return "";
  // Pick off the first 1-2 chars that are a letter + optional sharp/flat.
  const m = trimmed.match(/^([A-Ga-g])([#b♯♭]?)/);
  if (!m) return "";
  const letter = (m[1] ?? "").toUpperCase();
  const accidental = m[2] ?? "";
  if (!accidental) return letter;
  // Convert flat → equivalent sharp so "Bb" matches "A#".
  if (accidental === "b" || accidental === "♭") {
    const flatToSharp: Record<string, string> = {
      A: "G#",
      B: "A#",
      C: "B",
      D: "C#",
      E: "D#",
      F: "E",
      G: "F#",
    };
    return flatToSharp[letter] ?? `${letter}b`;
  }
  return `${letter}#`;
}

function sameKeyRoot(a: string, b: string): boolean {
  const ra = rootPitchClass(a);
  const rb = rootPitchClass(b);
  return ra !== "" && ra === rb;
}

function remoteCategoryToSampleCategory(category?: string): Sample["category"] {
  if (category === "808") return "bass";
  if (category === "drums") return "drums";
  if (category === "fx") return "fx";
  if (category === "misc") return "melody";
  if (category?.toLowerCase().includes("vocal")) return "vocals";
  return "melody";
}

function remoteSoundToSample(sound: RemoteSound): Sample | null {
  if (!sound.url) return null;
  return {
    id: sound.id ?? sound.url,
    name: sound.name?.trim() || "Supabase Audio Asset",
    bpm: typeof sound.bpm === "number" ? sound.bpm : 0,
    key: sound.key,
    category: remoteCategoryToSampleCategory(sound.category),
    url: sound.url,
    source: "supabase",
  };
}
