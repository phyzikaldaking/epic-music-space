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
  instrument?: string;
  kit?: string;
  bucket?: string;
  format?: string;
  duration?: number;
  size?: number;
}

interface RemoteSound {
  id?: string;
  name?: string;
  url?: string;
  category?: string;
  bpm?: number;
  key?: string;
  instrument?: string;
  kit?: string;
  bucket?: string;
  format?: string;
  duration?: number;
  size?: number;
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
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("category");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [uploadState, setUploadState] = useState<string | null>(null);
  const [waveforms, setWaveforms] = useState<Record<string, number[]>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
        const response = await fetch("/api/studio/sounds/library?limit=50&sort=" + encodeURIComponent(sort), {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => ({}))) as {
          sounds?: RemoteSound[];
          backend?: string;
          error?: string;
          nextCursor?: number | null;
        };
        if (!response.ok) throw new Error(payload.error ?? `Live library request failed: ${response.status}`);
        if (payload.backend !== "supabase") throw new Error("Live Supabase backend is not configured for this library.");
        const liveSamples = (payload.sounds ?? []).map(remoteSoundToSample).filter(Boolean) as Sample[];
        if (liveSamples.length === 0) throw new Error("No live audio assets are available yet.");
        setSamples(liveSamples);
        setNextCursor(payload.nextCursor ?? null);
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
  }, [sort]);

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

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    for (const file of list) {
      setUploadState(`Uploading ${file.name}…`);
      const form = new FormData();
      form.append("file", file);
      try {
        const payload = await new Promise<{ sound?: RemoteSound; error?: string }>((resolve, reject) => {
          const request = new XMLHttpRequest();
          request.open("POST", "/api/studio/sounds/upload");
          request.upload.onprogress = (event) => {
            if (event.lengthComputable) setUploadState(`Uploading ${file.name}… ${Math.round((event.loaded / event.total) * 100)}%`);
          };
          request.onload = () => {
            const body = JSON.parse(request.responseText || "{}") as { sound?: RemoteSound; error?: string };
            if (request.status >= 200 && request.status < 300) resolve(body);
            else reject(new Error(body.error ?? `Upload failed (${request.status})`));
          };
          request.onerror = () => reject(new Error("Upload failed. Check your connection and retry."));
          request.send(form);
        });
        if (!payload.sound) throw new Error("Upload response did not include the uploaded sound.");
        const uploaded = remoteSoundToSample(payload.sound);
        if (uploaded) setSamples((current) => [uploaded, ...current.filter((item) => item.id !== uploaded.id)]);
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : "Upload failed. Retry the file.");
      }
    }
    setUploadState(null);
  }

  async function loadMore() {
    if (nextCursor == null) return;
    const response = await fetch(`/api/studio/sounds/library?limit=50&cursor=${nextCursor}&sort=${encodeURIComponent(sort)}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setStatusMessage(payload.error ?? "Could not load more assets."); return; }
    const more = (payload.sounds ?? []).map(remoteSoundToSample).filter(Boolean) as Sample[];
    setSamples((current) => [...current, ...more.filter((item) => !current.some((existing) => existing.id === item.id))]);
    setNextCursor(payload.nextCursor ?? null);
  }

  function toggleFavorite(id: string) {
    setFavorites((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      localStorage.setItem("ems-studio-favorites", JSON.stringify(next));
      return next;
    });
  }

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
          <div className="mt-3 flex flex-wrap gap-2">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search kits, instruments, assets…" className="min-w-[220px] flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white outline-none" />
        <select value={sort} onChange={(event) => setSort(event.target.value)} className="rounded-lg border border-white/10 bg-black/40 px-2 py-2 text-xs text-white"><option value="category">Category</option><option value="name">Name</option><option value="newest">Newest</option></select>
        <button type="button" onClick={() => setFavorites((current) => current.includes("__only__") ? current.filter((item) => item !== "__only__") : [...current, "__only__"])} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/70">★ Favorites</button>
        <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">Import audio</button>
        <input ref={fileInputRef} type="file" accept="audio/*,.wav,.mp3,.flac,.m4a,.ogg,.aiff" multiple className="hidden" onChange={(event) => { if (event.target.files) void uploadFiles(event.target.files); event.currentTarget.value = ""; }} />
      </div>
      <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void uploadFiles(event.dataTransfer.files); }} className="mt-2 rounded-lg border border-dashed border-white/15 px-3 py-2 text-center text-[11px] text-white/45">Drop audio files here to import{uploadState ? ` · ${uploadState}` : ""}</div>

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
                  onDoubleClick={() => toggleFavorite(s.id)}
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
                  <span className="min-w-0 truncate"><span className="mr-1">{favorites.includes(s.id) ? "★" : "☆"}</span>{s.name}<span className="ml-2 text-[9px] text-white/35">{s.bucket ?? ""} · {s.instrument ?? ""} · {s.format ?? ""}{s.duration ? ` · ${s.duration.toFixed(2)}s` : ""}</span>{waveforms[s.id] && <span className="ml-2 inline-flex h-3 items-end gap-px align-middle">{waveforms[s.id].slice(0, 12).map((peak, index) => <i key={index} className="w-px bg-emerald-300/70" style={{height: `${Math.max(2, Math.round(peak * 12))}px`}} />)}</span>}</span>
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

function extractWaveformPeaks(buffer: AudioBuffer, count: number): number[] {
  const channel = buffer.getChannelData(0);
  const bucketSize = Math.max(1, Math.floor(channel.length / count));
  return Array.from({ length: count }, (_, index) => {
    let peak = 0;
    const start = index * bucketSize;
    const end = Math.min(channel.length, start + bucketSize);
    for (let i = start; i < end; i += 1) peak = Math.max(peak, Math.abs(channel[i] ?? 0));
    return peak;
  });
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
    instrument: sound.instrument, kit: sound.kit, bucket: sound.bucket, format: sound.format, duration: sound.duration, size: sound.size,
    key: sound.key,
    category: remoteCategoryToSampleCategory(sound.category),
    url: sound.url,
  };
}
