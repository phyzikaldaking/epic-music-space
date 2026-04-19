import Link from "next/link";

export const metadata = { title: "Marketplace" };

const products = [
  { id: "1", title: "Dark Trap Kit Vol.1", type: "BEAT", price: 29.99, artist: "krown_prod", plays: 1240 },
  { id: "2", title: "Lo-Fi Chill Loops", type: "BEAT", price: 19.99, artist: "luna_beats", plays: 890 },
  { id: "3", title: "Mixing & Mastering (Full)", type: "MASTERING", price: 149.99, artist: "studiox_official", plays: 420 },
  { id: "4", title: "808 Slap Bundle", type: "BEAT", price: 49.99, artist: "slap_god", plays: 2100 },
  { id: "5", title: "Vocal Mixing Session", type: "MIXING", price: 79.99, artist: "mixmaster_j", plays: 310 },
  { id: "6", title: "Afrobeat Construction Kit", type: "BEAT", price: 39.99, artist: "afro_vibes", plays: 670 },
  { id: "7", title: "Track Feedback & Review", type: "SERVICE", price: 24.99, artist: "A&R_pro", plays: 180 },
  { id: "8", title: "Drill Instrumentals Pack", type: "BEAT", price: 34.99, artist: "drillworks", plays: 1560 },
];

const typeColors: Record<string, string> = {
  BEAT: "bg-ems-gold/20 text-ems-gold",
  MIXING: "bg-blue-500/20 text-blue-300",
  MASTERING: "bg-ems-purple/20 text-purple-300",
  SERVICE: "bg-green-500/20 text-green-300",
};

const filters = ["All", "Beats", "Mixing", "Mastering", "Services"];

export default function MarketplacePage() {
  return (
    <main className="min-h-screen bg-ems-black">
      <header className="flex items-center justify-between px-6 py-4 border-b border-ems-border">
        <Link href="/" className="font-sora font-bold text-xl text-ems-gold neon-text-gold">EMS</Link>
        <nav className="flex items-center gap-6 text-sm text-gray-400">
          <Link href="/city" className="hover:text-ems-gold transition-colors">City</Link>
          <Link href="/billboards" className="hover:text-ems-gold transition-colors">Billboards</Link>
          <Link href="/dashboard" className="hover:text-ems-gold transition-colors">Dashboard</Link>
        </nav>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="font-sora text-4xl font-bold text-ems-text mb-2">Marketplace</h1>
          <p className="text-gray-400 text-lg">
            Buy beats, mixing, mastering, and services directly from artists.{" "}
            <span className="text-ems-gold font-semibold">85% goes to the creator.</span>
          </p>
        </div>

        {/* Search + filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <input
            type="search"
            placeholder="Search beats, services..."
            className="flex-1 bg-ems-surface border border-ems-border rounded-lg px-4 py-3 text-ems-text placeholder-gray-600 focus:outline-none focus:border-ems-gold/50 transition-colors"
          />
          <div className="flex gap-2 flex-wrap">
            {filters.map((f) => (
              <button
                key={f}
                className="px-4 py-2 rounded-lg border border-ems-border text-sm text-gray-400 hover:border-ems-gold/30 hover:text-ems-gold transition-colors"
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {products.map((p) => (
            <div key={p.id} className="glass-card border border-ems-border hover:border-ems-gold/30 transition-colors overflow-hidden flex flex-col">
              {/* Artwork placeholder */}
              <div className="w-full aspect-square bg-gradient-to-br from-ems-surface to-ems-black flex items-center justify-center border-b border-ems-border">
                <div className="text-5xl">🎵</div>
              </div>

              <div className="p-4 flex flex-col flex-1">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-sm text-ems-text leading-tight">{p.title}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 font-medium ${typeColors[p.type]}`}>
                    {p.type}
                  </span>
                </div>

                <Link
                  href={`/studio/${p.artist}`}
                  className="text-xs text-gray-500 hover:text-ems-gold transition-colors mb-3"
                >
                  @{p.artist}
                </Link>

                <div className="text-xs text-gray-600 mb-4">{p.plays.toLocaleString()} plays</div>

                <div className="flex items-center justify-between mt-auto">
                  <span className="font-sora font-bold text-ems-gold">${p.price.toFixed(2)}</span>
                  <Link
                    href={`/marketplace/${p.id}`}
                    className="text-xs bg-ems-gold text-black font-semibold px-3 py-1.5 rounded-lg hover:bg-yellow-400 transition-colors"
                  >
                    Buy
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
