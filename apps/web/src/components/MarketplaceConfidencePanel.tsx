"use client";

import { useMemo, useState } from "react";

type CompareTrack = {
  id: string;
  title: string;
  artist: string;
  audioUrl?: string | null;
  aiScore?: number;
};

type Props = {
  tracks: CompareTrack[];
};

const CUE_POINTS = [
  { label: "Intro", seconds: 8 },
  { label: "Drop", seconds: 42 },
  { label: "Hook", seconds: 68 },
] as const;

export default function MarketplaceConfidencePanel({ tracks }: Props) {
  const usableTracks = useMemo(() => tracks.filter((t) => !!t.audioUrl).slice(0, 12), [tracks]);
  const [aId, setAId] = useState(usableTracks[0]?.id ?? "");
  const [bId, setBId] = useState(usableTracks[1]?.id ?? usableTracks[0]?.id ?? "");

  const trackA = usableTracks.find((t) => t.id === aId) ?? usableTracks[0];
  const trackB = usableTracks.find((t) => t.id === bId) ?? usableTracks[1] ?? usableTracks[0];

  function jumpToCue(audioId: "ab-player-a" | "ab-player-b", seconds: number) {
    const el = document.getElementById(audioId) as HTMLAudioElement | null;
    if (!el) return;
    el.currentTime = seconds;
    void el.play().catch(() => undefined);
  }

  return (
    <section className="grid gap-6 lg:grid-cols-3">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-300">License clarity</p>
        <h3 className="mt-2 text-xl font-bold text-white">Plain-language rights summary</h3>
        <div className="mt-4 space-y-3 text-sm text-white/75">
          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="font-semibold text-white">Social + Ads</p>
            <p>Use on socials and paid ads. Keep forever. No hidden renewal trap.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="font-semibold text-white">Broadcast</p>
            <p>TV, streaming, and podcast distribution rights included for listed territory.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="font-semibold text-white">Exclusive</p>
            <p>Track removed from open market after purchase with transfer-proof license token.</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">Waveform compare</p>
            <h3 className="mt-1 text-xl font-bold text-white">Instant A/B with cue points</h3>
          </div>
          <p className="text-xs text-white/50">Jump to cue and audition each section side by side.</p>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/30 p-3">
            <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-white/45">Track A</label>
            <select
              aria-label="Track A selector"
              value={trackA?.id ?? ""}
              onChange={(e) => setAId(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white"
            >
              {usableTracks.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.title} - {track.artist}
                </option>
              ))}
            </select>
            <audio id="ab-player-a" className="mt-3 w-full" controls preload="none" src={trackA?.audioUrl ?? undefined} />
          </div>

          <div className="rounded-xl border border-white/10 bg-black/30 p-3">
            <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-white/45">Track B</label>
            <select
              aria-label="Track B selector"
              value={trackB?.id ?? ""}
              onChange={(e) => setBId(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white"
            >
              {usableTracks.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.title} - {track.artist}
                </option>
              ))}
            </select>
            <audio id="ab-player-b" className="mt-3 w-full" controls preload="none" src={trackB?.audioUrl ?? undefined} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {CUE_POINTS.map((cue) => (
            <div key={cue.label} className="flex items-center gap-2 rounded-lg border border-white/12 bg-black/25 px-3 py-2">
              <span className="text-xs font-semibold text-white/75">{cue.label} {cue.seconds}s</span>
              <button
                type="button"
                onClick={() => jumpToCue("ab-player-a", cue.seconds)}
                className="rounded bg-brand-500/25 px-2 py-1 text-xs font-semibold text-brand-200 hover:bg-brand-500/35"
              >
                A
              </button>
              <button
                type="button"
                onClick={() => jumpToCue("ab-player-b", cue.seconds)}
                className="rounded bg-accent-500/25 px-2 py-1 text-xs font-semibold text-accent-200 hover:bg-accent-500/35"
              >
                B
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 lg:col-span-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-300">Social proof</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="text-xs uppercase tracking-[0.15em] text-white/45">Recent licenses</p>
            <p className="mt-2 text-sm text-white/80">27 licenses in the last hour across cinematic and trailer packs.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="text-xs uppercase tracking-[0.15em] text-white/45">Trending creators</p>
            <ul className="mt-2 space-y-1 text-sm text-white/85">
              {tracks.slice(0, 3).map((track) => (
                <li key={`creator-${track.id}`}>{track.artist}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="text-xs uppercase tracking-[0.15em] text-white/45">Chart movers</p>
            <ul className="mt-2 space-y-1 text-sm text-white/85">
              {tracks
                .slice(0, 3)
                .map((track) => (
                  <li key={`mover-${track.id}`}>{track.title} (+{Math.max(1, Math.round((track.aiScore ?? 0) / 5))})</li>
                ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
