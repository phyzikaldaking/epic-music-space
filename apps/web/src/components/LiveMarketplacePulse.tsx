"use client";

import { useEffect, useMemo, useState } from "react";

type TrackPulse = {
  id: string;
  title: string;
  artist: string;
  rankScore?: number | null;
};

interface LiveMarketplacePulseProps {
  tracks: TrackPulse[];
}

const alertTemplates = [
  "A new challenger is pushing for the crown.",
  "Boost activity detected on the exchange floor.",
  "A top screen is under pressure.",
  "Licensing demand is moving the rankings.",
  "A takeover window just opened.",
];

export default function LiveMarketplacePulse({ tracks }: LiveMarketplacePulseProps) {
  const topTrack = tracks[0];
  const challenger = tracks[1];
  const [cycle, setCycle] = useState(0);
  const [flash, setFlash] = useState(true);

  const alert = useMemo(() => {
    if (!topTrack) return "Marketplace rankings are waiting for live activity.";
    const base = alertTemplates[cycle % alertTemplates.length];
    if (cycle % 3 === 0 && challenger) {
      return `${challenger.title} is chasing ${topTrack.title}.`;
    }
    return base;
  }, [challenger, cycle, topTrack]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCycle((value) => value + 1);
      setFlash(true);
      window.setTimeout(() => setFlash(false), 1200);
    }, 9000);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <section className="relative mt-8 overflow-hidden rounded-[2rem] border border-cyan-200/15 bg-black/45 p-5 shadow-2xl shadow-black/50 backdrop-blur-2xl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(34,211,238,0.18),transparent_32%),radial-gradient(circle_at_85%_20%,rgba(253,224,71,0.14),transparent_28%)]" />
      {flash && <div className="absolute inset-0 animate-pulse bg-gold-200/10" />}

      <div className="relative grid gap-5 lg:grid-cols-[1fr_360px] lg:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex h-3 w-3 rounded-full bg-green-300 shadow-lg shadow-green-300/60" />
            <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-100/80">
              Live Market Pulse
            </p>
            <span className="rounded-full border border-green-300/25 bg-green-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-green-100">
              Auto-refresh every 30s
            </span>
          </div>

          <h2 className="mt-3 text-3xl font-black tracking-[-0.055em] text-white md:text-5xl">
            Rankings feel alive. Artists feel pressure.
          </h2>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
            {alert}
          </p>
        </div>

        <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.045] p-4">
          <div className="mb-3 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.18em] text-white/35">
            <span>Takeover Watch</span>
            <span>Cycle {String((cycle % 5) + 1).padStart(2, "0")}</span>
          </div>

          <div className="space-y-3">
            {tracks.slice(0, 3).map((track, index) => (
              <div key={track.id} className="rounded-2xl border border-white/10 bg-black/35 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">
                      #{index + 1} {index === 0 ? "Crown" : "Challenger"}
                    </p>
                    <p className="mt-1 line-clamp-1 text-sm font-black text-white">
                      {track.title}
                    </p>
                    <p className="line-clamp-1 text-xs text-white/40">{track.artist}</p>
                  </div>
                  <p className="text-sm font-black text-gold-100">
                    {Number(track.rankScore ?? 0).toFixed(1)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
