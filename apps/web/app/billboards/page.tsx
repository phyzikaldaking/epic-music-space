import Link from "next/link";

export const metadata = { title: "Billboard Marketplace" };

type District = "DOWNTOWN_PRIME" | "VIP_TOWERS" | "PRODUCER_ALLEY" | "UNDERGROUND";

const billboards: {
  id: string;
  district: District;
  slot: string;
  price: number;
  duration: string;
  available: boolean;
  impressions: string;
}[] = [
  { id: "1", district: "DOWNTOWN_PRIME", slot: "Billboard A-1 (Hero)", price: 299, duration: "7 days", available: false, impressions: "50K+" },
  { id: "2", district: "DOWNTOWN_PRIME", slot: "Billboard A-2 (Side)", price: 199, duration: "7 days", available: true, impressions: "30K+" },
  { id: "3", district: "VIP_TOWERS", slot: "VIP Banner Top", price: 499, duration: "7 days", available: false, impressions: "20K+" },
  { id: "4", district: "PRODUCER_ALLEY", slot: "Alley Wall #1", price: 99, duration: "7 days", available: true, impressions: "15K+" },
  { id: "5", district: "PRODUCER_ALLEY", slot: "Alley Wall #2", price: 99, duration: "7 days", available: true, impressions: "12K+" },
  { id: "6", district: "UNDERGROUND", slot: "UG Spot #1", price: 29, duration: "7 days", available: true, impressions: "5K+" },
  { id: "7", district: "UNDERGROUND", slot: "UG Spot #2", price: 29, duration: "7 days", available: true, impressions: "4K+" },
  { id: "8", district: "UNDERGROUND", slot: "UG Spot #3", price: 29, duration: "7 days", available: false, impressions: "4K+" },
];

const districtStyles: Record<District, { label: string; border: string; badge: string }> = {
  DOWNTOWN_PRIME: { label: "Downtown Prime", border: "border-ems-gold/30", badge: "bg-ems-gold/20 text-ems-gold" },
  VIP_TOWERS: { label: "VIP Towers", border: "border-ems-purple/30", badge: "bg-ems-purple/20 text-purple-300" },
  PRODUCER_ALLEY: { label: "Producer Alley", border: "border-blue-500/30", badge: "bg-blue-500/20 text-blue-300" },
  UNDERGROUND: { label: "Underground", border: "border-gray-500/30", badge: "bg-gray-500/20 text-gray-300" },
};

export default function BillboardsPage() {
  const available = billboards.filter((b) => b.available).length;

  return (
    <main className="min-h-screen bg-ems-black">
      <header className="flex items-center justify-between px-6 py-4 border-b border-ems-border">
        <Link href="/" className="font-sora font-bold text-xl text-ems-gold neon-text-gold">EMS</Link>
        <nav className="flex items-center gap-6 text-sm text-gray-400">
          <Link href="/city" className="hover:text-ems-gold transition-colors">City</Link>
          <Link href="/marketplace" className="hover:text-ems-gold transition-colors">Marketplace</Link>
          <Link href="/dashboard" className="hover:text-ems-gold transition-colors">Dashboard</Link>
        </nav>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="font-sora text-4xl font-bold text-ems-text">Billboard Marketplace</h1>
            <span className="px-3 py-1 rounded-full bg-green-500/20 text-green-400 text-sm font-semibold">
              {available} Available
            </span>
          </div>
          <p className="text-gray-400 text-lg">
            Limited slots. Scarcity pricing. Buy visibility before it&apos;s gone.
          </p>
        </div>

        {/* Scarcity bar */}
        <div className="glass-card border border-ems-gold/20 p-4 mb-8 flex items-center gap-4">
          <span className="text-2xl">⏰</span>
          <div className="flex-1">
            <div className="text-sm font-semibold text-ems-text mb-1">
              {billboards.length - available} of {billboards.length} billboard slots currently occupied
            </div>
            <div className="w-full bg-ems-border rounded-full h-2">
              <div
                className="bg-ems-gold rounded-full h-2 transition-all"
                style={{ width: `${((billboards.length - available) / billboards.length) * 100}%` }}
              />
            </div>
          </div>
          <div className="text-right">
            <div className="text-ems-gold font-bold text-sm">Resets weekly</div>
            <div className="text-gray-500 text-xs">Every Monday 00:00 UTC</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {billboards.map((b) => {
            const style = districtStyles[b.district];
            return (
              <div
                key={b.id}
                className={`glass-card border ${style.border} p-6 flex flex-col ${!b.available ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full ${style.badge}`}>
                    {style.label}
                  </span>
                  {b.available ? (
                    <span className="text-xs text-green-400 font-semibold">● Available</span>
                  ) : (
                    <span className="text-xs text-red-400 font-semibold">● Occupied</span>
                  )}
                </div>

                <h3 className="font-sora font-bold text-ems-text mb-1">{b.slot}</h3>
                <div className="text-gray-500 text-xs mb-4">
                  {b.impressions} estimated impressions · {b.duration}
                </div>

                <div className="flex-1" />

                <div className="flex items-center justify-between mt-4">
                  <div>
                    <div className="font-sora text-2xl font-bold text-ems-gold">${b.price}</div>
                    <div className="text-xs text-gray-500">per {b.duration}</div>
                  </div>
                  {b.available ? (
                    <Link
                      href={`/billboards/${b.id}/purchase`}
                      className="bg-ems-gold text-black font-semibold text-sm px-5 py-2.5 rounded-lg hover:bg-yellow-400 transition-colors"
                    >
                      Book Now
                    </Link>
                  ) : (
                    <button
                      disabled
                      className="border border-ems-border text-gray-600 font-semibold text-sm px-5 py-2.5 rounded-lg cursor-not-allowed"
                    >
                      Taken
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
