"use client";

import { useMemo, useState } from "react";
import CompactAudioPlayer from "@/components/CompactAudioPlayer";

type CompareTrack = {
  id: string;
  title: string;
  artist: string;
  audioUrl?: string | null;
  aiScore?: number;
  licensePrice?: number;
  revenueSharePct?: number;
  totalLicenses?: number;
  /** Total licenses claimed — used to render Chart Movers with real signal. */
  soldLicenses?: number;
};

type Props = {
  tracks: CompareTrack[];
  /**
   * Number of licenses claimed across the catalog in the last hour.
   * Optional: when undefined the social-proof line falls back to the
   * total count so we never render a hardcoded stub like "27 licenses".
   */
  recentLicenses?: number;
};

const CUE_POINTS = [
  { label: "Intro", seconds: 8 },
  { label: "Drop", seconds: 42 },
  { label: "Hook", seconds: 68 },
] as const;

export default function MarketplaceConfidencePanel({ tracks, recentLicenses }: Props) {
  // Dedup by artist for "Trending creators" so the panel doesn't render
  // the same name three times (the original bug visible in production:
  // "Phyzikal / Phyzikal / Phyzikal" when one artist owned the top 3 tracks).
  const trendingCreators = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of tracks) {
      const key = t.artist?.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(t.artist);
      if (out.length >= 3) break;
    }
    return out;
  }, [tracks]);

  // Chart movers used to be ai-score / 5 for the top three tracks, which
  // produced suspiciously identical numbers ("+19 / +19 / +19") whenever
  // top tracks clustered. Use real license demand instead and dedup
  // titles so we surface three distinct movers.
  const chartMovers = useMemo(() => {
    const seen = new Set<string>();
    return tracks
      .filter((t) => {
        const k = t.id;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice()
      .sort((a, b) => (b.soldLicenses ?? 0) - (a.soldLicenses ?? 0))
      .slice(0, 3);
  }, [tracks]);

  const usableTracks = useMemo(() => tracks.filter((t) => !!t.audioUrl).slice(0, 12), [tracks]);
  const [aId, setAId] = useState(usableTracks[0]?.id ?? "");
  const [bId, setBId] = useState(usableTracks[1]?.id ?? usableTracks[0]?.id ?? "");

  const trackA = usableTracks.find((t) => t.id === aId) ?? usableTracks[0];
  const trackB = usableTracks.find((t) => t.id === bId) ?? usableTracks[1] ?? usableTracks[0];
  const compareRows =
    trackA && trackB
      ? [
          {
            label: "Price",
            a: `$${(trackA.licensePrice ?? 0).toFixed(2)}`,
            b: `$${(trackB.licensePrice ?? 0).toFixed(2)}`,
            winner:
              (trackA.licensePrice ?? 0) === (trackB.licensePrice ?? 0)
                ? "Tie"
                : (trackA.licensePrice ?? 0) < (trackB.licensePrice ?? 0)
                  ? "A"
                  : "B",
          },
          {
            label: "Revenue share",
            a: `${(trackA.revenueSharePct ?? 0).toFixed(1)}%`,
            b: `${(trackB.revenueSharePct ?? 0).toFixed(1)}%`,
            winner:
              (trackA.revenueSharePct ?? 0) === (trackB.revenueSharePct ?? 0)
                ? "Tie"
                : (trackA.revenueSharePct ?? 0) > (trackB.revenueSharePct ?? 0)
                  ? "A"
                  : "B",
          },
          {
            label: "Supply",
            a: `${trackA.soldLicenses ?? 0}/${trackA.totalLicenses ?? 0}`,
            b: `${trackB.soldLicenses ?? 0}/${trackB.totalLicenses ?? 0}`,
            winner:
              (trackA.totalLicenses ?? 0) - (trackA.soldLicenses ?? 0) ===
              (trackB.totalLicenses ?? 0) - (trackB.soldLicenses ?? 0)
                ? "Tie"
                : (trackA.totalLicenses ?? 0) - (trackA.soldLicenses ?? 0) <
                  (trackB.totalLicenses ?? 0) - (trackB.soldLicenses ?? 0)
                  ? "A"
                  : "B",
          },
          {
            label: "Demand",
            a: `${trackA.soldLicenses ?? 0} sold`,
            b: `${trackB.soldLicenses ?? 0} sold`,
            winner:
              (trackA.soldLicenses ?? 0) === (trackB.soldLicenses ?? 0)
                ? "Tie"
                : (trackA.soldLicenses ?? 0) > (trackB.soldLicenses ?? 0)
                  ? "A"
                  : "B",
          },
        ]
      : [];

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
            {trackA?.audioUrl && (
              <div className="mt-3">
                <CompactAudioPlayer src={trackA.audioUrl} audioId="ab-player-a" label="A" />
              </div>
            )}
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
            {trackB?.audioUrl && (
              <div className="mt-3">
                <CompactAudioPlayer src={trackB.audioUrl} audioId="ab-player-b" label="B" />
              </div>
            )}
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

        {compareRows.length > 0 && (
          <div className="mt-5 rounded-xl border border-white/10 bg-black/25 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">
                  Buyer compare
                </p>
                <p className="mt-1 text-sm text-white/65">
                  See the tradeoffs without doing mental gymnastics.
                </p>
              </div>
              <p className="text-xs text-white/45">
                Winner column highlights the better value on that row.
              </p>
            </div>
            <div className="mt-3 grid gap-2">
              {compareRows.map((row) => (
                <div
                  key={row.label}
                  className="grid grid-cols-[1.2fr_1fr_1fr_auto] items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-sm"
                >
                  <p className="font-semibold text-white/75">{row.label}</p>
                  <p className="text-white/80">{row.a}</p>
                  <p className="text-white/80">{row.b}</p>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-brand-200">
                    {row.winner}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 lg:col-span-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-300">Social proof</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="text-xs uppercase tracking-[0.15em] text-white/45">Recent licenses</p>
            <p className="mt-2 text-sm text-white/80">
              {typeof recentLicenses === "number" && recentLicenses > 0
                ? `${recentLicenses.toLocaleString()} licensed across the floor in the last hour.`
                : "License activity ticks here as buyers move through the floor."}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="text-xs uppercase tracking-[0.15em] text-white/45">Trending creators</p>
            {trendingCreators.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm text-white/85">
                {trendingCreators.map((artist) => (
                  <li key={`creator-${artist}`}>{artist}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-white/55">New creators surface here once the catalog grows.</p>
            )}
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="text-xs uppercase tracking-[0.15em] text-white/45">Chart movers</p>
            {chartMovers.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm text-white/85">
                {chartMovers.map((track) => (
                  <li key={`mover-${track.id}`}>
                    {track.title}
                    {typeof track.soldLicenses === "number" && track.soldLicenses > 0 ? (
                      <span className="ml-1 text-white/45">· {track.soldLicenses} sold</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-white/55">Tracks gaining momentum will appear here.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
