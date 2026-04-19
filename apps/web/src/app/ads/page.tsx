import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import AdPurchaseForm from "@/components/AdPurchaseForm";

export const dynamic = "force-dynamic";

const LOCATIONS = [
  {
    key: "MARKETPLACE_BANNER",
    label: "Marketplace Banner",
    description: "Full-width banner at the top of the Marketplace page.",
    dailyRate: 99,
    icon: "🛒",
  },
  {
    key: "STUDIO_SIDEBAR",
    label: "Studio Sidebar",
    description: "Sidebar placement on artist Studio pages.",
    dailyRate: 49,
    icon: "🎤",
  },
  {
    key: "CITY_BILLBOARD",
    label: "City Billboard",
    description: "Premium billboard shown on the City district page.",
    dailyRate: 199,
    icon: "🏙️",
  },
  {
    key: "VERSUS_BANNER",
    label: "Versus Banner",
    description: "Banner shown above active Versus battle cards.",
    dailyRate: 79,
    icon: "⚔️",
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
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-10">
        <h1 className="text-4xl font-extrabold">📢 Ad Placements</h1>
        <p className="mt-2 text-white/50">
          Promote your music, label, or brand across the platform. All ad slots are
          purchased for fixed durations.
        </p>
      </div>

      {sp.purchased && (
        <div className="mb-8 rounded-2xl bg-green-500/20 border border-green-500/30 p-4 text-green-400">
          ✅ Your ad placement purchase is being processed. It will go live once payment is confirmed.
        </div>
      )}

      {/* Pricing grid */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold">Ad Locations</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {LOCATIONS.map((loc) => (
            <div
              key={loc.key}
              className="glass rounded-2xl p-5"
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="text-2xl">{loc.icon}</span>
                <h3 className="font-bold">{loc.label}</h3>
              </div>
              <p className="mb-3 text-sm text-white/50">{loc.description}</p>
              <p className="text-brand-400 font-bold">
                ${loc.dailyRate}/day
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Purchase form */}
      {session ? (
        <section className="glass mb-10 rounded-2xl p-6">
          <h2 className="mb-4 text-xl font-semibold">Purchase an Ad Slot</h2>
          <AdPurchaseForm />
        </section>
      ) : (
        <section className="glass mb-10 rounded-2xl p-6 text-center text-white/50">
          <a href="/auth/signin" className="text-brand-400 hover:underline">
            Sign in
          </a>{" "}
          to purchase ad placements.
        </section>
      )}

      {/* Active ads */}
      <section>
        <h2 className="mb-4 text-xl font-semibold">Active Placements</h2>
        {activeAds.length === 0 ? (
          <div className="glass rounded-2xl p-6 text-center text-sm text-white/30">
            No active ads at the moment.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {activeAds.map((ad) => (
              <div key={ad.id} className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ad.mediaUrl}
                  alt={ad.title}
                  className="h-32 w-full object-cover"
                />
                <div className="p-4">
                  <p className="font-semibold">{ad.title}</p>
                  <p className="text-xs text-white/40">
                    {ad.location.replace(/_/g, " ")} · by {ad.owner.name}
                  </p>
                  <p className="mt-1 text-xs text-white/30">
                    Runs until {new Date(ad.endDate).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
