import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import BoostPurchaseSection from "./BoostPurchaseSection";

export default async function BoostPage() {
  const session = await auth();

  // Fetch artist's songs if logged in
  let songs: { id: string; title: string; boostScore: number; aiScore: number }[] = [];
  if (session?.user?.id) {
    songs = await prisma.song.findMany({
      where: { artistId: session.user.id, isActive: true },
      select: { id: true, title: true, boostScore: true, aiScore: true },
      orderBy: { createdAt: "desc" },
    });
  }

  const packages = [
    {
      id: "plays_1k",
      icon: "🎧",
      label: "1,000 Plays",
      price: "$10",
      description: "Drive 1,000 targeted plays to your track within 7 days.",
      boost: "+5 boost pts",
      duration: "7 days",
      borderClass: "border-brand-500/40 hover:border-brand-500",
      glowClass: "hover:shadow-[0_0_24px_rgba(108,92,231,0.3)]",
      badge: null as string | null,
    },
    {
      id: "trending",
      icon: "🔥",
      label: "Trending Boost",
      price: "$25",
      description: "Feature your track in the Trending section for 3 days. Maximum exposure.",
      boost: "+15 boost pts",
      duration: "3 days",
      borderClass: "border-accent-500/60 hover:border-accent-500",
      glowClass: "hover:shadow-[0_0_30px_rgba(0,245,255,0.3)]",
      badge: "POPULAR" as string | null,
    },
    {
      id: "city_spotlight",
      icon: "🏙️",
      label: "City Spotlight",
      price: "$75",
      description: "Premium city map billboard placement + homepage banner for 7 days.",
      boost: "+40 boost pts",
      duration: "7 days",
      borderClass: "border-gold/60 hover:border-gold",
      glowClass: "hover:shadow-[0_0_40px_rgba(255,215,0,0.25)]",
      badge: "ELITE" as string | null,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      {/* Header */}
      <div className="mb-10 text-center">
        <span className="mb-3 inline-block rounded-full bg-brand-500/20 px-4 py-1 text-xs font-semibold tracking-widest text-brand-400 uppercase">
          Boost Center
        </span>
        <h1 className="text-4xl font-extrabold text-gradient-ems">
          Amplify Your Reach
        </h1>
        <p className="mt-3 text-white/50 max-w-xl mx-auto">
          Invest in visibility. Every boost drives real plays and elevates your track on the EMS ranking algorithm.
        </p>
        <div className="mt-6 flex items-center justify-center gap-6 text-sm text-white/40">
          <span><span className="text-brand-400 font-bold">2,847</span> tracks boosted</span>
          <span>•</span>
          <span><span className="text-accent-400 font-bold">94%</span> see rank improvement</span>
          <span>•</span>
          <span><span className="text-gold font-bold">$128K</span> in boosts this month</span>
        </div>
      </div>

      {/* Packages grid */}
      <div className="grid gap-6 md:grid-cols-3">
        {packages.map((pkg) => (
          <div
            key={pkg.id}
            className={`glass-card rounded-2xl p-6 border transition-all duration-300 ${pkg.borderClass} ${pkg.glowClass} relative flex flex-col`}
          >
            {pkg.badge && (
              <div className={`absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-xs font-bold ${
                pkg.badge === "POPULAR" ? "bg-accent-500 text-black" : "bg-gold text-black"
              }`}>
                {pkg.badge}
              </div>
            )}

            <div className="text-4xl mb-4">{pkg.icon}</div>
            <h2 className="text-xl font-extrabold">{pkg.label}</h2>
            <p className="mt-1 text-white/50 text-sm flex-1">{pkg.description}</p>

            <div className="mt-5 space-y-2">
              <div className="flex items-center gap-2 text-xs text-white/40">
                <span className="text-brand-400">⚡</span> {pkg.boost}
              </div>
              <div className="flex items-center gap-2 text-xs text-white/40">
                <span className="text-accent-400">⏱</span> {pkg.duration}
              </div>
            </div>

            <div className="mt-5">
              <span className="text-3xl font-extrabold text-gradient-ems">{pkg.price}</span>
            </div>

            {/* Interactive purchase section (client component) */}
            <BoostPurchaseSection
              packageId={pkg.id}
              isLoggedIn={!!session}
              songs={songs.map((s) => ({ id: s.id, title: s.title }))}
            />
          </div>
        ))}
      </div>

      {/* How it works */}
      <section className="mt-16">
        <h2 className="text-2xl font-bold text-center mb-8">How Boosts Work</h2>
        <div className="grid gap-5 md:grid-cols-3 text-center">
          {[
            { step: "01", icon: "🎯", title: "Choose a Package", body: "Select the boost tier that matches your goals and budget." },
            { step: "02", icon: "💳", title: "Secure Checkout", body: "Pay safely via Stripe. Your boost activates immediately after payment." },
            { step: "03", icon: "📈", title: "Watch Your Rank Rise", body: "Your boost score increases, pushing your track up the EMS rankings." },
          ].map((s) => (
            <div key={s.step} className="glass-card rounded-2xl p-6">
              <div className="text-4xl mb-3">{s.icon}</div>
              <div className="text-xs text-brand-400 font-bold mb-1">STEP {s.step}</div>
              <h3 className="font-bold">{s.title}</h3>
              <p className="mt-2 text-sm text-white/40">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Your track boost status */}
      {session && songs.length > 0 && (
        <section className="mt-16">
          <h2 className="text-xl font-bold mb-5">Your Track Boost Status</h2>
          <div className="space-y-3">
            {songs.map((song) => (
              <div key={song.id} className="glass-card rounded-xl p-4 flex items-center gap-4">
                <div className="text-2xl">🎵</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{song.title}</p>
                </div>
                <div className="w-32">
                  <div className="flex items-center justify-between text-xs text-white/40 mb-1">
                    <span>Boost</span>
                    <span>{song.boostScore.toFixed(0)}/100</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-500"
                      style={{ width: `${song.boostScore}%` }}
                    />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-white/40">AI Score</p>
                  <p className="font-bold text-accent-400">{song.aiScore.toFixed(1)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
