import { Suspense } from "react";
import Link from "next/link";

export default function CityPage() {
  return (
    <main className="min-h-screen bg-ems-black flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-ems-border">
        <Link href="/" className="font-sora font-bold text-xl text-ems-gold neon-text-gold">
          EMS
        </Link>
        <nav className="flex items-center gap-6 text-sm text-gray-400">
          <Link href="/billboards" className="hover:text-ems-gold transition-colors">Billboards</Link>
          <Link href="/marketplace" className="hover:text-ems-gold transition-colors">Marketplace</Link>
          <Link href="/dashboard" className="hover:text-ems-gold transition-colors">Dashboard</Link>
        </nav>
      </header>

      <div className="flex-1 relative">
        {/* 3D City Canvas Placeholder */}
        <Suspense
          fallback={
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 border-2 border-ems-gold/30 border-t-ems-gold rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-400">Loading the city...</p>
              </div>
            </div>
          }
        >
          <CityCanvas />
        </Suspense>
      </div>
    </main>
  );
}

function CityCanvas() {
  return (
    <div className="absolute inset-0 city-grid-bg flex items-center justify-center">
      {/* Glow effects */}
      <div className="absolute top-1/3 left-1/4 w-64 h-64 bg-ems-gold/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/3 right-1/4 w-64 h-64 bg-ems-purple/10 rounded-full blur-3xl" />

      <div className="relative z-10 text-center max-w-2xl px-6">
        <div className="text-6xl mb-6">🌆</div>
        <h1 className="font-sora text-4xl font-bold text-ems-text mb-4">
          The City Is{" "}
          <span className="text-ems-gold neon-text-gold">Coming</span>
        </h1>
        <p className="text-gray-400 text-lg mb-8">
          The 3D walkable city powered by Three.js is under construction.
          Soon you&apos;ll be able to walk through districts, click on studios,
          and interact with billboards in real time.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { name: "Downtown Prime", color: "border-ems-gold/50 bg-ems-gold/5 text-ems-gold" },
            { name: "VIP Towers", color: "border-ems-purple/50 bg-ems-purple/5 text-purple-300" },
            { name: "Producer Alley", color: "border-blue-500/50 bg-blue-500/5 text-blue-300" },
            { name: "Underground", color: "border-gray-500/50 bg-gray-500/5 text-gray-300" },
          ].map((d) => (
            <div key={d.name} className={`rounded-lg border p-3 text-xs font-semibold text-center ${d.color}`}>
              {d.name}
            </div>
          ))}
        </div>

        <Link
          href="/auth/register"
          className="inline-block bg-ems-gold text-black font-semibold px-8 py-3 rounded-xl hover:bg-yellow-400 transition-colors"
        >
          Claim Your Studio First →
        </Link>
      </div>
    </div>
  );
}
