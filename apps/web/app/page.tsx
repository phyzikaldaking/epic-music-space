import Link from "next/link";

const districts = [
  {
    name: "Downtown Prime",
    tier: "Premium",
    color: "from-yellow-500/20 to-yellow-900/10",
    border: "border-ems-gold/30",
    badge: "bg-ems-gold/20 text-ems-gold",
    description: "Highest visibility. Maximum exposure.",
    price: "$99+/mo",
  },
  {
    name: "VIP Towers",
    tier: "Exclusive",
    color: "from-purple-500/20 to-purple-900/10",
    border: "border-ems-purple/30",
    badge: "bg-ems-purple/20 text-purple-300",
    description: "Invite-only. Elite artists only.",
    price: "By invite",
  },
  {
    name: "Producer Alley",
    tier: "Mid-Tier",
    color: "from-blue-500/10 to-blue-900/5",
    border: "border-blue-500/20",
    badge: "bg-blue-500/20 text-blue-300",
    description: "Beat makers and serious artists.",
    price: "$29/mo",
  },
  {
    name: "Underground",
    tier: "Free",
    color: "from-gray-500/10 to-gray-900/5",
    border: "border-gray-500/20",
    badge: "bg-gray-500/20 text-gray-300",
    description: "Start here. Build your reputation.",
    price: "$9/mo",
  },
];

const features = [
  {
    icon: "🏗",
    title: "Own Your Studio",
    description:
      "Your studio is your digital real estate. Customize it, brand it, and make it the hub for your music career.",
  },
  {
    icon: "📣",
    title: "Buy Billboards",
    description:
      "Limited billboard slots with scarcity pricing. The more artists compete, the higher the value.",
  },
  {
    icon: "💰",
    title: "Sell Directly",
    description:
      "Sell beats, mixing services, and more. You keep 85%. We take 15%. No middlemen.",
  },
  {
    icon: "🏆",
    title: "Compete for Attention",
    description:
      "Rank higher in your district. Win visibility. Build your empire in the city.",
  },
  {
    icon: "🎫",
    title: "Host Events",
    description:
      "Ticketed listening sessions, album drops, and live shows. Monetize your audience directly.",
  },
  {
    icon: "🐋",
    title: "Whale Deals",
    description:
      "Labels, brands, and influencers can own districts and buy full visibility packages.",
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-ems-black overflow-hidden">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 border-b border-ems-border/50 backdrop-blur-md bg-ems-black/80">
        <Link href="/" className="font-sora font-bold text-xl tracking-widest text-ems-gold neon-text-gold">
          EMS
        </Link>
        <div className="hidden md:flex items-center gap-8 text-sm text-gray-400">
          <Link href="/billboards" className="hover:text-ems-gold transition-colors">Billboards</Link>
          <Link href="/marketplace" className="hover:text-ems-gold transition-colors">Marketplace</Link>
          <Link href="/city" className="hover:text-ems-gold transition-colors">City</Link>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/auth/login"
            className="text-sm text-gray-300 hover:text-white transition-colors px-4 py-2"
          >
            Sign In
          </Link>
          <Link
            href="/auth/register"
            className="text-sm font-semibold bg-ems-gold text-black px-5 py-2 rounded-lg hover:bg-yellow-400 transition-colors"
          >
            Join Free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center min-h-screen text-center px-6 city-grid-bg">
        {/* Glow orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-ems-purple/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-ems-gold/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-5xl mx-auto">
          <div className="inline-block mb-6 px-4 py-2 rounded-full border border-ems-gold/30 bg-ems-gold/5 text-ems-gold text-sm font-medium tracking-wider uppercase">
            The Digital City for Artists
          </div>

          <h1 className="font-sora text-5xl md:text-7xl lg:text-8xl font-bold leading-tight mb-6">
            <span className="text-ems-text">Own Your</span>
            <br />
            <span className="text-ems-gold neon-text-gold">Stage.</span>
            <br />
            <span className="text-ems-text">Rule The</span>
            <br />
            <span className="text-ems-purple" style={{ textShadow: "0 0 20px #7B3FE4" }}>City.</span>
          </h1>

          <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            EMS is not a streaming platform. It&apos;s a{" "}
            <span className="text-ems-gold font-semibold">monetized attention economy</span>{" "}
            where artists own studios, buy visibility, sell beats, and compete for dominance.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/auth/register"
              className="w-full sm:w-auto font-semibold bg-ems-gold text-black px-8 py-4 rounded-xl text-lg hover:bg-yellow-400 transition-all hover:scale-105 shadow-gold"
            >
              Enter the City →
            </Link>
            <Link
              href="/city"
              className="w-full sm:w-auto font-semibold border border-ems-purple/50 text-ems-text px-8 py-4 rounded-xl text-lg hover:border-ems-purple hover:bg-ems-purple/10 transition-all"
            >
              Explore the Map
            </Link>
          </div>

          <div className="mt-12 flex items-center justify-center gap-8 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span>Live artists competing now</span>
            </div>
            <div className="hidden sm:block">·</div>
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-ems-gold font-semibold">15%</span>
              <span>platform fee. You keep the rest.</span>
            </div>
          </div>
        </div>
      </section>

      {/* Districts */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-sora text-3xl md:text-5xl font-bold mb-4">
              Choose Your{" "}
              <span className="text-ems-gold">District</span>
            </h2>
            <p className="text-gray-400 text-lg max-w-xl mx-auto">
              Every district has different visibility, pricing, and prestige. Where you live matters.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {districts.map((d) => (
              <div
                key={d.name}
                className={`glass-card p-6 border ${d.border} bg-gradient-to-br ${d.color} hover:scale-[1.02] transition-transform cursor-pointer`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-sora text-xl font-bold text-ems-text mb-1">{d.name}</h3>
                    <p className="text-gray-400 text-sm">{d.description}</p>
                  </div>
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full ${d.badge}`}>
                    {d.tier}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-4">
                  <span className="text-ems-gold font-bold text-lg">{d.price}</span>
                  <Link
                    href="/auth/register"
                    className="text-sm text-gray-400 hover:text-ems-gold transition-colors"
                  >
                    Claim spot →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-6 border-t border-ems-border city-grid-bg">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-sora text-3xl md:text-5xl font-bold mb-4">
              This Is How You{" "}
              <span className="text-ems-purple" style={{ textShadow: "0 0 20px #7B3FE4" }}>Win</span>
            </h2>
            <p className="text-gray-400 text-lg max-w-xl mx-auto">
              The loop is simple. Join → Build → Compete → Earn → Repeat.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div key={f.title} className="glass-card p-6 hover:border-ems-gold/30 transition-colors">
                <div className="text-4xl mb-4">{f.icon}</div>
                <h3 className="font-sora text-lg font-bold text-ems-text mb-2">{f.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-24 px-6 border-t border-ems-border">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="font-sora text-3xl md:text-5xl font-bold mb-4">
            Simple <span className="text-ems-gold">Pricing</span>
          </h2>
          <p className="text-gray-400 text-lg mb-16">Start free. Scale as you grow.</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { name: "Starter", price: "$9", desc: "Underground access. Build your studio.", cta: "Start Building", highlight: false },
              { name: "Pro", price: "$29", desc: "Billboard access. Producer Alley district.", cta: "Go Pro", highlight: true },
              { name: "Prime", price: "$99+", desc: "Full features. Downtown Prime. VIP access.", cta: "Dominate", highlight: false },
            ].map((plan) => (
              <div
                key={plan.name}
                className={`glass-card p-8 flex flex-col ${plan.highlight ? "border-ems-gold/50 shadow-gold scale-105" : "border-ems-border"}`}
              >
                {plan.highlight && (
                  <div className="text-xs font-bold text-black bg-ems-gold px-3 py-1 rounded-full self-center mb-4 uppercase tracking-wider">
                    Most Popular
                  </div>
                )}
                <div className="font-sora text-xl font-bold text-ems-text mb-2">{plan.name}</div>
                <div className="font-sora text-4xl font-bold text-ems-gold mb-1">{plan.price}</div>
                <div className="text-gray-500 text-sm mb-6">/month</div>
                <p className="text-gray-400 text-sm mb-8 flex-1">{plan.desc}</p>
                <Link
                  href="/auth/register"
                  className={`py-3 rounded-xl font-semibold text-sm transition-all ${
                    plan.highlight
                      ? "bg-ems-gold text-black hover:bg-yellow-400"
                      : "border border-ems-border text-ems-text hover:border-ems-gold/50 hover:text-ems-gold"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 border-t border-ems-border">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-sora text-4xl md:text-6xl font-bold mb-6">
            The City Is{" "}
            <span className="text-ems-gold neon-text-gold">Open.</span>
          </h2>
          <p className="text-gray-400 text-lg mb-10">
            Artists are already competing. Billboards are already selling. Your studio is waiting.
          </p>
          <Link
            href="/auth/register"
            className="inline-block font-semibold bg-ems-gold text-black px-10 py-5 rounded-xl text-xl hover:bg-yellow-400 transition-all hover:scale-105 shadow-gold"
          >
            Claim Your Studio Now →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-ems-border py-8 px-6 text-center text-gray-600 text-sm">
        <span className="font-sora font-bold text-ems-gold mr-2">EMS</span>
        © {new Date().getFullYear()} Epic Music Space · The NASDAQ of music attention.
      </footer>
    </main>
  );
}
