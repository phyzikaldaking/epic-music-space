import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import AdPurchaseForm from "@/components/AdPurchaseForm";

export const dynamic = "force-dynamic";

const LOCATIONS = [
  {
    key: "MARKETPLACE_BANNER",
    label: "Marketplace Banner",
    description: "Full-width banner at the top of the Marketplace page. Maximum reach.",
    dailyRate: 99,
    icon: "🛒",
    reach: "~2,400 daily impressions",
    border: "border-brand-500/30",
    bg: "bg-brand-500/6",
    textColor: "text-brand-400",
  },
  {
    key: "CITY_BILLBOARD",
    label: "City Billboard",
    description: "Premium billboard shown on the City district page.",
    dailyRate: 199,
    icon: "🏙️",
    reach: "~4,100 daily impressions",
    border: "border-gold-500/35",
    bg: "bg-gold-500/6",
    textColor: "text-gold-400",
  },
  {
    key: "VERSUS_BANNER",
    label: "Versus Banner",
    description: "Banner above active Versus battle cards.",
    dailyRate: 79,
    icon: "⚔️",
    reach: "~1,800 daily impressions",
    border: "border-accent-500/30",
    bg: "bg-accent-500/6",
    textColor: "text-accent-400",
  },
  {
    key: "STUDIO_SIDEBAR",
    label: "Studio Sidebar",
    description: "Sidebar placement on artist Studio pages.",
    dailyRate: 49,
    icon: "🎤",
    reach: "~900 daily impressions",
    border: "border-white/15",
    bg: "bg-white/3",
    textColor: "text-white/60",
  },
];

export default async function AdsPage({
  searchParams,
}: {
  searchParams: Promise<{ purchased?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();

  const activeAds = await prisma.adPlacement.findMany({
    where: { isActive: true, endDate: { gte: new Date() } },
    include: { owner: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="relative min-h-screen">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed top-0 right-1/4 h-[400px] w-[600px] rounded-full bg-gold-500/6 blur-[120px]" />

      <div className="relative mx-auto max-w-6xl px-4 py-12">
        {/* ── Header ────────────────────────────────────── */}
        <div className="mb-10">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-gold-500/30 bg-gold-500/8 px-3 py-1 text-xs font-semibold text-gold-400">
            📢 Brand Advertising
          </div>
          <h1 className="text-4xl font-extrabold">
            <span className="text-gradient-gold">Ad Placements</span>
          </h1>
          <p className="mt-2 text-white/45 max-w-xl">
            Promote your music, label, or brand across the EMS city. All ad slots
            are purchased for fixed durations with guaranteed placement.
          </p>
        </div>

        {sp.purchased && (
          <div className="mb-8 rounded-2xl border border-green-500/25 bg-green-500/10 p-4 text-green-400">
            ✅ Your ad placement purchase is being processed. It will go live once
            payment is confirmed.
          </div>
        )}

        {/* ── Placement stats ───────────────────────────── */}
        <div className="mb-10 grid gap-4 sm:grid-cols-3">
          {[
            { label: "Active campaigns", value: activeAds.length, icon: "📊", color: "text-brand-400" },
            { label: "Total placements", value: LOCATIONS.length, icon: "📍", color: "text-accent-400" },
            { label: "Avg daily reach", value: "9,200+", icon: "👁️", color: "text-gold-400" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-white/8 bg-[#141414] p-5 card-hover-neon"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-widest text-white/35">
                  {s.label}
                </span>
                <span className="text-xl">{s.icon}</span>
              </div>
              <p className={`stat-number ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* ── Ad location cards ─────────────────────────── */}
        <section className="mb-10">
          <h2 className="mb-5 text-xl font-bold">Ad Locations</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {LOCATIONS.map((loc) => (
              <div
                key={loc.key}
                className={`rounded-2xl border ${loc.border} ${loc.bg} p-5 card-hover-neon`}
              >
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">{loc.icon}</span>
                    <div>
                      <h3 className={`font-bold ${loc.textColor}`}>{loc.label}</h3>
                      <p className="text-xs text-white/35">{loc.reach}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-extrabold ${loc.textColor}`}>
                      ${loc.dailyRate}
                    </p>
                    <p className="text-xs text-white/30">/day</p>
                  </div>
                </div>
                <p className="text-sm text-white/50">{loc.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Purchase form ─────────────────────────────── */}
        {session ? (
          <section className="mb-12 glass-card rounded-2xl p-6 border border-white/8">
            <h2 className="mb-5 text-xl font-bold">Purchase an Ad Slot</h2>
            <AdPurchaseForm />
          </section>
        ) : (
          <section className="mb-12 rounded-2xl border border-brand-500/25 bg-brand-500/6 p-8 text-center">
            <p className="mb-3 text-2xl">📢</p>
            <p className="mb-1 font-bold">Ready to advertise?</p>
            <p className="mb-4 text-sm text-white/45">Sign in to purchase ad placements.</p>
            <a
              href="/auth/signin"
              className="inline-block rounded-xl bg-brand-500 px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-600 transition glow-purple-sm"
            >
              Sign in →
            </a>
          </section>
        )}

        {/* ── Active ads ────────────────────────────────── */}
        <section>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-bold">Active Placements</h2>
            {activeAds.length > 0 && (
              <span className="text-sm text-white/35">{activeAds.length} running</span>
            )}
          </div>
          {activeAds.length === 0 ? (
            <div className="rounded-2xl border border-white/8 bg-[#141414] p-8 text-center text-sm text-white/30">
              No active ad placements at the moment. Be the first!
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {activeAds.map((ad) => (
                <div
                  key={ad.id}
                  className="overflow-hidden rounded-2xl border border-white/8 bg-[#141414] card-hover-neon"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={ad.mediaUrl}
                    alt={ad.title}
                    className="h-36 w-full object-cover opacity-80"
                  />
                  <div className="p-4">
                    <p className="font-bold">{ad.title}</p>
                    <p className="text-xs text-white/35 mt-0.5">
                      {ad.location.replace(/_/g, " ")} · by {ad.owner.name}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="rounded-full bg-green-500/15 border border-green-500/20 px-2 py-0.5 text-xs font-bold text-green-400">
                        LIVE
                      </span>
                      <p className="text-xs text-white/30">
                        Until {new Date(ad.endDate).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
