/** Horizontal LUFS meter against streaming targets. The bar maps a
 *  -30..0 LUFS range to the strip; target zones for each platform are
 *  overlaid as colored bands so the user can see at a glance whether
 *  the master is in the right neighborhood. Reused by:
 *    • the studio MasterPanel (live readings while mixing)
 *    • the public track page (captured-at-publish readings — gives
 *      buyers confidence the master is "stream-ready")
 */
export function LufsMeter({ lufs, label }: { lufs: number; label?: string }) {
  const min = -30;
  const max = 0;
  // Streaming target reference points. Spotify/Apple/Tidal/YouTube all
  // normalize down to about -14 LUFS integrated. Sub-mixes hot enough
  // to clip the limiter chain (-8 and up) get flagged red.
  const targets = [
    { label: "QUIET", from: -30, to: -18, hue: 200 },
    { label: "STREAM (-14)", from: -18, to: -10, hue: 130 },
    { label: "HOT", from: -10, to: -6, hue: 30 },
    { label: "CRUSHED", from: -6, to: 0, hue: 0 },
  ];
  const value = Number.isFinite(lufs) ? Math.max(min, Math.min(max, lufs)) : min;
  const ratio = (value - min) / (max - min);

  return (
    <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-2">
      <div className="mb-1 flex items-baseline justify-between text-[9px] font-black uppercase tracking-widest text-white/45">
        <span>{label ?? "LUFS · loudness"}</span>
        <span className="font-mono text-cyan-200/80">
          {Number.isFinite(lufs) ? `${lufs.toFixed(1)} LUFS` : "—"}
        </span>
      </div>
      <div className="relative h-3 overflow-hidden rounded-full border border-white/10">
        {targets.map((t) => {
          const left = ((t.from - min) / (max - min)) * 100;
          const width = ((t.to - t.from) / (max - min)) * 100;
          return (
            <div
              key={t.label}
              // Bumped from opacity-30 → 60 so the reference bands are
              // legible at a glance. Earlier they read as a near-flat
              // strip with the playhead floating above invisible cues.
              className="absolute top-0 bottom-0 opacity-60"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                background: `hsl(${t.hue}, 80%, 45%)`,
              }}
              title={t.label}
            />
          );
        })}
        <div
          className="absolute top-0 bottom-0 w-1 rounded bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)]"
          style={{ left: `calc(${ratio * 100}% - 2px)` }}
          aria-label={`Loudness ${value.toFixed(1)} LUFS`}
        />
        <div
          className="absolute top-0 bottom-0 w-px bg-emerald-300"
          style={{ left: `${((-14 - min) / (max - min)) * 100}%` }}
          aria-label="Streaming target -14 LUFS"
        />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[8px] text-white/65">
        <span>-30</span>
        <span>-20</span>
        <span className="text-emerald-300">-14</span>
        <span>-10</span>
        <span>0</span>
      </div>
    </div>
  );
}
