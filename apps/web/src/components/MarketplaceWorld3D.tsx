"use client";

type MarketplaceWorld3DProps = {
  items: Array<{ id: string; title?: string | null }>;
};

export default function MarketplaceWorld3D({
  items,
}: MarketplaceWorld3DProps) {
  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-500/10 via-fuchsia-500/10 to-amber-300/10 p-6"
      aria-label="Marketplace world overview"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,.15),transparent_40%),radial-gradient(circle_at_80%_80%,rgba(217,70,239,.18),transparent_35%)]" />
      <div className="relative flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-300">
            Marketplace World
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Live district pulse
          </h2>
          <p className="mt-1 text-sm text-white/70">
            {items.length} active tracks in this cycle
          </p>
        </div>
        <div className="rounded-full border border-cyan-300/40 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-200">
          3D scene loading
        </div>
      </div>
    </section>
  );
}