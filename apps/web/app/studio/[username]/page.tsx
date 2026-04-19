import Link from "next/link";
import { notFound } from "next/navigation";

interface StudioPageProps {
  params: { username: string };
}

// Placeholder data — replace with real DB query
const getMockStudio = (username: string) => ({
  username,
  name: `${username.charAt(0).toUpperCase() + username.slice(1)}'s Studio`,
  bio: "Producer | Beat Maker | Artist. Based in LA. Selling heat.",
  district: "PRODUCER_ALLEY",
  visits: 3_240,
  products: [
    { id: "1", title: "Trap Kit Vol.1", type: "BEAT", price: 29.99 },
    { id: "2", title: "Dark 808 Loop Pack", type: "BEAT", price: 19.99 },
    { id: "3", title: "Vocal Mixing", type: "MIXING", price: 79.99 },
  ],
  followers: 412,
  joinedYear: 2024,
});

const districtLabels: Record<string, { label: string; color: string }> = {
  DOWNTOWN_PRIME: { label: "Downtown Prime", color: "text-ems-gold border-ems-gold/40 bg-ems-gold/10" },
  VIP_TOWERS: { label: "VIP Towers", color: "text-purple-300 border-ems-purple/40 bg-ems-purple/10" },
  PRODUCER_ALLEY: { label: "Producer Alley", color: "text-blue-300 border-blue-500/40 bg-blue-500/10" },
  UNDERGROUND: { label: "Underground", color: "text-gray-300 border-gray-500/40 bg-gray-500/10" },
};

export default function StudioPage({ params }: StudioPageProps) {
  if (!params.username) return notFound();
  const studio = getMockStudio(params.username);
  const districtStyle = districtLabels[studio.district] ?? districtLabels.UNDERGROUND;

  return (
    <main className="min-h-screen bg-ems-black">
      <header className="flex items-center justify-between px-6 py-4 border-b border-ems-border">
        <Link href="/" className="font-sora font-bold text-xl text-ems-gold neon-text-gold">EMS</Link>
        <nav className="flex items-center gap-6 text-sm text-gray-400">
          <Link href="/city" className="hover:text-ems-gold transition-colors">City</Link>
          <Link href="/marketplace" className="hover:text-ems-gold transition-colors">Marketplace</Link>
          <Link href="/billboards" className="hover:text-ems-gold transition-colors">Billboards</Link>
        </nav>
      </header>

      {/* Studio hero */}
      <div className="relative h-48 bg-gradient-to-br from-ems-purple/20 via-ems-black to-ems-gold/10 city-grid-bg border-b border-ems-border">
        <div className="absolute inset-0 flex items-end px-6 pb-0">
          <div className="w-24 h-24 rounded-2xl bg-ems-surface border-2 border-ems-border flex items-center justify-center text-4xl translate-y-12 shadow-xl">
            🎵
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6">
        <div className="flex items-start justify-between mt-16 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="font-sora text-3xl font-bold text-ems-text">{studio.name}</h1>
              <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${districtStyle.color}`}>
                {districtStyle.label}
              </span>
            </div>
            <p className="text-gray-500 text-sm">@{studio.username}</p>
            <p className="text-gray-400 text-sm mt-2 max-w-lg">{studio.bio}</p>
            <div className="flex items-center gap-4 mt-3 text-xs text-gray-600">
              <span>{studio.visits.toLocaleString()} visits</span>
              <span>·</span>
              <span>{studio.followers} followers</span>
              <span>·</span>
              <span>Joined {studio.joinedYear}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <button className="border border-ems-border text-gray-400 text-sm px-4 py-2 rounded-lg hover:border-ems-gold/30 hover:text-ems-gold transition-colors">
              Follow
            </button>
            <Link
              href={`/studio/${studio.username}/contact`}
              className="bg-ems-gold text-black text-sm font-semibold px-5 py-2 rounded-lg hover:bg-yellow-400 transition-colors"
            >
              Contact
            </Link>
          </div>
        </div>

        {/* Products */}
        <section className="mb-12">
          <h2 className="font-sora text-xl font-bold text-ems-text mb-4">Store</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
            {studio.products.map((p) => (
              <div key={p.id} className="glass-card border border-ems-border hover:border-ems-gold/30 transition-colors p-5">
                <div className="w-full aspect-video bg-gradient-to-br from-ems-surface to-ems-black rounded-lg flex items-center justify-center mb-4">
                  <span className="text-4xl">🎵</span>
                </div>
                <h3 className="font-semibold text-ems-text mb-1">{p.title}</h3>
                <p className="text-xs text-gray-500 mb-4">{p.type}</p>
                <div className="flex items-center justify-between">
                  <span className="font-sora font-bold text-ems-gold">${p.price.toFixed(2)}</span>
                  <Link
                    href={`/marketplace/${p.id}`}
                    className="text-xs bg-ems-gold text-black font-semibold px-4 py-1.5 rounded-lg hover:bg-yellow-400 transition-colors"
                  >
                    Buy
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
