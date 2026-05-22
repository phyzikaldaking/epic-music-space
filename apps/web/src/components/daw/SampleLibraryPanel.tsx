"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { useStudioContext } from "@/lib/studioContextStore";

interface Sample {
  id: string;
  name: string;
  bpm: number;
  key?: string;
  category: "drums" | "bass" | "melody" | "fx" | "vocals";
  url: string;
}

interface RemoteSound {
  id?: string;
  name?: string;
  url?: string;
  category?: string;
  bpm?: number;
  key?: string;
}

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

const BPM_MATCH_TOLERANCE = 0.05;

export default function SampleLibraryPanel({ onLoadSample }: Props) {
  const [filter, setFilter] = useState<Sample["category"] | "all">("all");
  const [samples, setSamples] = useState<Sample[]>([]);
  const [libraryStatus, setLibraryStatus] = useState<"loading" | "ready" | "denied">("loading");
  const [statusMessage, setStatusMessage] = useState("Loading live Supabase audio assets...");
  const [recentLoad, setRecentLoad] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const studioContext = useStudioContext();
  const projectBpm = studioContext.bpm;
  const projectKey = studioContext.projectKey;
  const visible = useMemo(
    () => (filter === "all" ? samples : samples.filter((s) => s.category === filter)),
    [filter, samples],
  );

  const ctxRef = useRef<AudioContext | null>(null);
  const bufferCacheRef = useRef<Map<string, AudioBuffer | "missing">>(new Map());
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadLiveSamples() {
      setLibraryStatus("loading");
      setStatusMessage("Loading live Supabase audio assets...");
      try {
        const response = await fetch("/api/studio/sounds/library?limit=1000", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => ({}))) as {
          sounds?: RemoteSound[];
          backend?: string;
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error ?? `Live library request failed: ${response.status}`);
        if (payload.backend !== "supabase") throw new Error("Live Supabase backend is not configured for this library.");
        const liveSamples = (payload.sounds ?? []).map(remoteSoundToSample).filter(Boolean) as Sample[];
        if (liveSamples.length === 0) throw new Error("No live audio assets are available yet.");
        setSamples(liveSamples);
        setLibraryStatus("ready");
        setStatusMessage(`${liveSamples.length} live Supabase audio assets ready.`);
      } catch (error) {
        if (controller.signal.aborted) return;
        setSamples([]);
        setLibraryStatus("denied");
        setStatusMessage(error instanceof Error ? error.message : "Live audio library is unavailable.");
      }
    }

    void loadLiveSamples();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
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
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
    if (cached === "missing") return;
    if (cached) {
      buffer = cached;
    } else {
      try {
        const res = await fetch(sample.url);
        if (!res.ok) throw new Error("Audio asset unavailable");
        const arr = await res.arrayBuffer();
        buffer = await ctx.decodeAudioData(arr);
        bufferCacheRef.current.set(sample.url, buffer);
      } catch {
        bufferCacheRef.current.set(sample.url, "missing");
        return;
      }
    }
    if (!buffer) return;
    try {
      sourceRef.current?.stop();
    } catch {
      // ignore
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    src.connect(gain).connect(ctx.destination);
    src.start(0, 0, Math.min(1.5, buffer.duration));
    sourceRef.current = src;
    setPreviewing(sample.id);
    src.onended = () => setPreviewing((cur) => (cur === sample.id ? null : cur));
  }

  function onSampleHover(sample: Sample) {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
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
    <div className="rounded-2xl border border-emerald-400/20 bg-black/40 p-4 shadow-[0_0_24px_rgba(16,185,129,0.08)]">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200/90">
            EMS Audio Assets · Live Library
          </p>
          <p className="mt-0.5 text-[11px] text-white/50">{statusMessage}</p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${
            libraryStatus === "ready"
              ? "border-emerald-400/45 bg-emerald-500/15 text-emerald-100"
              : libraryStatus === "loading"
                ? "border-cyan-300/35 bg-cyan-300/10 text-cyan-100"
                : "border-red-300/45 bg-red-500/10 text-red-100"
          }`}
        >
          {libraryStatus === "ready" ? "Live" : libraryStatus === "loading" ? "Loading" : "No Access"}
        </span>
      </div>

      {libraryStatus === "denied" ? (
        <div className="mt-4 rounded-xl border border-red-300/20 bg-red-500/10 p-3 text-xs text-red-100/85">
          Live audio assets are not available for this session. No demo library is loaded. Check Supabase configuration, bucket permissions, or user access.
        </div>
      ) : (
        <>
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
              const bpmMatch =
                projectBpm != null &&
                s.bpm > 0 &&
                Math.abs(s.bpm - projectBpm) / projectBpm <= BPM_MATCH_TOLERANCE;
              const keyMatch = projectKey != null && s.key ? sameKeyRoot(projectKey, s.key) : false;
              const matches = bpmMatch || keyMatch;
              const offTempo = projectBpm != null && s.bpm > 0 && !bpmMatch && !keyMatch;
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
                    {bpmMatch && <span className="rounded bg-emerald-500/30 px-1 py-0.5 font-bold text-emerald-100">✓ bpm</span>}
                    {keyMatch && <span className="rounded bg-cyan-500/30 px-1 py-0.5 font-bold text-cyan-100">♪ key</span>}
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
        </>
      )}
    </div>
  );
}

function rootPitchClass(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return "";
  const m = trimmed.match(/^([A-Ga-g])([#b♯♭]?)/);
  if (!m) return "";
  const letter = (m[1] ?? "").toUpperCase();
  const accidental = m[2] ?? "";
  if (!accidental) return letter;
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
  const normalized = category?.toLowerCase() ?? "";
  if (category === "808" || normalized.includes("bass")) return "bass";
  if (normalized === "drums") return "drums";
  if (normalized === "fx") return "fx";
  if (normalized.includes("vocal") || normalized.includes("vox")) return "vocals";
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
  };
}
