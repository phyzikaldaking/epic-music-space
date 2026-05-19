"use client";

import { useEffect, useMemo, useState } from "react";
import { useFocusTrap } from "@/lib/useFocusTrap";

// Community drum-kit-pack browse modal (#29). Fetches public packs from
// /api/kit-packs, renders a grid (featured first, then by download
// count), and on click hands the sample manifest back to the parent so
// the BeatMachineGrid can assign each lane in one go.

type SampleManifestValue =
  | string
  | {
      url?: string;
      fileName?: string;
      name?: string;
      category?: string;
      gain?: number;
      engine?: Record<string, unknown>;
    };

type SampleManifest = Record<string, SampleManifestValue | SampleManifestValue[]>;

interface PackRow {
  id: string;
  name: string;
  description: string | null;
  genre: string | null;
  bpm: number | null;
  coverUrl: string | null;
  samples: SampleManifest;
  priceUsd: string | null;
  isFeatured: boolean;
  downloadCount: number;
  author: { id: string; name: string | null };
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called when the user picks a pack. Receives the lane->URL map; the
   *  studio is responsible for fetching each sample and assigning it
   *  via setBeatLaneSample. */
  onLoadPack: (samples: Record<string, string>, packName: string) => void;
}

const CATEGORY_TO_LANE: Record<string, string> = {
  kick: "kick",
  snare: "snare",
  clap: "clap",
  hat: "hat",
  closed_hat: "hat",
  open_hat: "openHat",
  openHat: "openHat",
  perc: "perc",
  percussion: "perc",
  "808": "bass808",
  bass: "bass808",
  bass808: "bass808",
  crash: "crash",
  fx: "crash",
  texture: "crash",
  vocal: "perc",
  melody: "bass808",
};

function sampleUrl(value: SampleManifestValue | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return typeof value.url === "string" ? value.url : null;
}

function normalizeSamples(samples: SampleManifest): Record<string, string> {
  const lanes: Record<string, string> = {};

  for (const [key, raw] of Object.entries(samples ?? {})) {
    const lane = CATEGORY_TO_LANE[key] ?? key;
    const first = Array.isArray(raw) ? raw[0] : raw;
    const url = sampleUrl(first);
    if (url && !lanes[lane]) lanes[lane] = url;
  }

  return lanes;
}

function sampleCount(samples: SampleManifest): number {
  return Object.values(samples ?? {}).reduce((total, value) => {
    if (Array.isArray(value)) return total + value.length;
    return total + (value ? 1 : 0);
  }, 0);
}

function sampleCategories(samples: SampleManifest): string[] {
  return Object.keys(samples ?? {}).slice(0, 6);
}

export default function KitMarketplaceModal({ open, onClose, onLoadPack }: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(open);
  const [packs, setPacks] = useState<PackRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genre, setGenre] = useState<string>("");

  const featuredCultureKit = useMemo(
    () => packs.find((pack) => pack.id === "ems-culture-monster-2026") ?? packs.find((pack) => pack.isFeatured),
    [packs],
  );

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = genre ? `?genre=${encodeURIComponent(genre)}` : "?featured=1";
    void fetch(`/api/kit-packs${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { packs: PackRow[] }) => {
        if (cancelled) return;
        setPacks(Array.isArray(data.packs) ? data.packs : []);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Couldn't load kit packs.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, genre]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Browse kit packs"
      ref={trapRef}
      className="fixed inset-0 z-[181] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
    >
      <div className="w-[min(920px,100%)] max-h-[85vh] overflow-y-auto rounded-2xl border border-cyan-400/40 bg-[#0a0a10]/95 p-6 shadow-2xl shadow-black/50">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.32em] text-cyan-300">
              Kit marketplace
            </p>
            <h2 className="mt-1 font-display text-xl uppercase tracking-wide text-white">
              Culture-ready drum kits
            </h2>
            <p className="mt-1 text-xs text-white/55">
              Load featured DrumKitPack samples straight from Supabase into the beat machine lanes.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close marketplace"
            className="rounded-md border border-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white/65 hover:bg-white/10"
          >
            Close
          </button>
        </div>

        {featuredCultureKit && (
          <button
            type="button"
            onClick={() => {
              onLoadPack(normalizeSamples(featuredCultureKit.samples), featuredCultureKit.name);
              onClose();
            }}
            className="mt-5 w-full rounded-2xl border border-amber-300/45 bg-gradient-to-r from-amber-400/20 via-fuchsia-500/10 to-cyan-400/15 p-4 text-left transition hover:scale-[1.01]"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.32em] text-amber-100">
              Featured EMS signature kit
            </p>
            <h3 className="mt-1 text-lg font-black text-white">{featuredCultureKit.name}</h3>
            <p className="mt-1 text-xs leading-5 text-white/65">
              {sampleCount(featuredCultureKit.samples)} source samples · {featuredCultureKit.genre ?? "Trap / Hip-Hop / R&B"}
              {featuredCultureKit.bpm ? ` · ${featuredCultureKit.bpm} BPM` : ""}
            </p>
            <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-cyan-100/80">
              Load Culture Monster into beat machine
            </p>
          </button>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {[
            ["", "Featured"],
            ["Trap / Hip-Hop / R&B", "Trap/R&B"],
            ["trap", "Trap"],
            ["drill", "Drill"],
            ["afro", "Afro"],
            ["lofi", "Lo-fi"],
            ["boomBap", "Boom Bap"],
          ].map(([value, label]) => (
            <button
              key={value || "featured"}
              type="button"
              onClick={() => setGenre(value)}
              className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest transition ${
                genre === value
                  ? "border-cyan-300/60 bg-cyan-400/20 text-cyan-100"
                  : "border-white/15 text-white/55 hover:bg-white/10"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-5">
          {loading && <p className="text-sm text-white/55">Loading...</p>}
          {error && <p className="text-sm text-rose-300">{error}</p>}
          {!loading && !error && packs.length === 0 && (
            <p className="text-sm text-white/45">
              No kits in the marketplace yet. Featured Supabase kits land here automatically.
            </p>
          )}
          {packs.length > 0 && (
            <ul className="grid gap-2 sm:grid-cols-2">
              {packs.map((p) => {
                const normalized = normalizeSamples(p.samples);
                const readyLaneCount = Object.keys(normalized).length;
                return (
                  <li
                    key={p.id}
                    className={`rounded-xl border p-3 transition ${
                      p.isFeatured
                        ? "border-amber-300/45 bg-amber-400/[0.06]"
                        : "border-white/10 bg-white/[0.03]"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {p.coverUrl ? (
                        <img
                          src={p.coverUrl}
                          alt={p.name}
                          className="h-16 w-16 rounded-md object-cover"
                        />
                      ) : (
                        <div className="flex h-16 w-16 items-center justify-center rounded-md bg-white/5 text-2xl">
                          🥁
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate text-sm font-bold text-white/95">
                            {p.name}
                          </p>
                          {p.isFeatured && (
                            <span className="rounded-full bg-amber-400/30 px-1.5 text-[9px] font-black uppercase tracking-widest text-amber-100">
                              Featured
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-white/55">
                          by {p.author.name ?? "EMS"}
                          {p.genre ? ` · ${p.genre}` : ""}
                          {p.bpm ? ` · ${p.bpm} BPM` : ""}
                          {` · ${p.downloadCount} loads`}
                        </p>
                        <p className="mt-1 text-[11px] text-cyan-100/70">
                          {sampleCount(p.samples)} samples · {readyLaneCount}/8 lanes ready
                        </p>
                        {sampleCategories(p.samples).length > 0 && (
                          <p className="mt-1 truncate text-[10px] uppercase tracking-widest text-white/35">
                            {sampleCategories(p.samples).join(" · ")}
                          </p>
                        )}
                        {p.description && (
                          <p className="mt-1 text-[11px] text-white/65 line-clamp-2">
                            {p.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-end gap-2">
                      {p.priceUsd && Number(p.priceUsd) > 0 ? (
                        <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/75">
                          ${Number(p.priceUsd).toFixed(2)}
                        </span>
                      ) : (
                        <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-100">
                          Free
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          onLoadPack(normalized, p.name);
                          onClose();
                        }}
                        disabled={readyLaneCount === 0}
                        className="rounded-md border border-cyan-300/45 bg-cyan-400/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-cyan-100 hover:bg-cyan-400/25 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        Load pack
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
