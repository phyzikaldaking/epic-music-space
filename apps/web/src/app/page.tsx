import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AnimateIn from "@/components/AnimateIn";
import AnimatedCounter from "@/components/AnimatedCounter";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export default async function HomePage() {
  const [songCount, licenseCount, transactionSum] = await Promise.all([
    prisma.song.count({ where: { isActive: true } }),
    prisma.licenseToken.count({ where: { status: "ACTIVE" } }),
    prisma.transaction.aggregate({
      where: { status: "SUCCEEDED", type: "LICENSE_PURCHASE" },
      _sum: { amount: true },
    }),
  ]);

  const totalRevenue = Number(transactionSum._sum.amount ?? 0);

  function fmtCount(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M+`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K+`;
    return `${n}+`;
  }

  function fmtRevenue(n: number) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  }

  const STATS = [
    { v: fmtCount(songCount),      l: "Songs Licensed",    icon: "🎵" },
    { v: fmtRevenue(totalRevenue), l: "Paid to Artists",   icon: "💸" },
    { v: fmtCount(licenseCount),   l: "License Holders",   icon: "🎟️" },
  ];

  return (
    <div className="flex flex-col items-center">

      {/* ── CINEMATIC HERO ───────────────────────────────────── */}
      <section className="relative w-full min-h-[100svh] flex items-center overflow-hidden bg-hero-mesh scanlines">

        {/* Animated ambient orbs */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-48 left-1/2 -translate-x-1/2 h-[700px] w-[1100px] rounded-full bg-brand-500/22 blur-[130px] animate-orb-drift" />
          <div className="absolute top-[55%] right-[-10%] h-[500px] w-[500px] rounded-full bg-accent-500/12 blur-[110px]" style={{ animationDelay: "6s" }} />
          <div className="absolute bottom-0 left-[-5%] h-[400px] w-[500px] rounded-full bg-gold-500/7 blur-[100px]" />
        </div>

        {/* Subtle grid overlay */}
        <div className="pointer-events-none absolute inset-0 grid-lines opacity-40" />

        {/* Content */}
        <div className="relative z-10 mx-auto max-w-6xl px-4 pb-28 pt-32 text-center w-full">

          {/* Live pill */}
          <div className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-brand-500/35 bg-brand-500/8 px-5 py-2 text-sm font-semibold text-brand-300 tracking-wide backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-400" />
            </span>
            Music Metaverse · Now Live
          </div>

          {/* Massive headline */}
          <h1 className="mb-6 font-display font-black uppercase leading-[0.92] tracking-tight">
            <span className="block text-[clamp(3.5rem,10vw,9rem)] text-white drop-shadow-2xl">
              Build your studio.
            </span>
            <span className="block text-[clamp(3.5rem,10vw,9rem)] text-gradient-ems drop-shadow-2xl">
              Run your sound.
            </span>
            <span className="block text-[clamp(3rem,8vw,7.5rem)] text-white/85 drop-shadow-xl">
              Own your city.
            </span>
          </h1>

          <p className="mx-auto mb-14 max-w-2xl text-lg md:text-xl text-white/50 leading-relaxed">
            Epic Music Space is a futuristic music marketplace. Artists own virtual
            studios, release limited licenses, fans earn revenue share, and brands
            advertise in a living digital city.
          </p>

          {/* Role CTAs */}
          <div className="flex flex-wrap justify-center gap-4 mb-20">
            <Link
              href="/auth/signup?role=ARTIST"
              className="group flex items-center gap-4 rounded-2xl border border-brand-500/45 bg-brand-500/12 px-8 py-5 text-sm font-bold tracking-wide transition-all duration-300 hover:border-brand-400/70 hover:bg-brand-500/22 hover:scale-105 glow-purple-sm"
            >
              <span className="text-3xl transition-transform duration-300 group-hover:scale-110">🎤</span>
              <span className="text-left">
                <span className="block text-brand-400 text-[10px] uppercase tracking-[0.15em] mb-1">Creator</span>
                <span className="text-base">I&apos;m an Artist</span>
              </span>
            </Link>
            <Link
              href="/auth/signup?role=LISTENER"
              className="group flex items-center gap-4 rounded-2xl border border-white/12 bg-white/4 px-8 py-5 text-sm font-bold tracking-wide transition-all duration-300 hover:border-accent-500/50 hover:bg-accent-500/10 hover:scale-105"
            >
              <span className="text-3xl transition-transform duration-300 group-hover:scale-110">🎧</span>
              <span className="text-left">
                <span className="block text-accent-400 text-[10px] uppercase tracking-[0.15em] mb-1">Fan</span>
                <span className="text-base">I&apos;m a Listener</span>
              </span>
            </Link>
            <Link
              href="/auth/signup?role=LABEL"
              className="group flex items-center gap-4 rounded-2xl border border-gold-500/35 bg-gold-500/5 px-8 py-5 text-sm font-bold tracking-wide transition-all duration-300 hover:border-gold-400/60 hover:bg-gold-500/12 hover:scale-105"
            >
              <span className="text-3xl transition-transform duration-300 group-hover:scale-110">📢</span>
              <span className="text-left">
                <span className="block text-gold-400 text-[10px] uppercase tracking-[0.15em] mb-1">Partner</span>
                <span className="text-base">I&apos;m a Brand</span>
              </span>
            </Link>
          </div>

          {/* Animated stats */}
          <div className="flex flex-wrap justify-center gap-10 md:gap-16">
            {STATS.map((s, i) => (
              <div key={s.l} className="text-center">
                <div className="mb-1 text-xl">{s.icon}</div>
                <AnimatedCounter
                  value={s.v}
                  className="block font-display font-black text-[2.6rem] leading-none tracking-tight text-gradient-ems"
                />
                <p className="mt-1.5 text-sm text-white/40 tracking-wide uppercase text-[11px] font-medium">{s.l}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom fade */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[#080808] to-transparent" />

        {/* Scroll cue */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/25 text-xs tracking-widest uppercase">
          <span>Scroll</span>
          <span className="block h-6 w-px bg-gradient-to-b from-white/30 to-transparent animate-bounce" />
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────── */}
      <section className="w-full px-4 py-32 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#080808] via-[#0c0a18] to-[#080808]" />

        <div className="relative mx-auto max-w-6xl">
          <AnimateIn className="mb-4 text-center">
            <span className="inline-block text-xs font-bold tracking-[0.2em] uppercase text-brand-400 bg-brand-500/10 border border-brand-500/25 rounded-full px-4 py-1.5 mb-5">
              The Economy
            </span>
            <h2 className="font-display font-black text-[clamp(2.5rem,6vw,5rem)] uppercase tracking-tight leading-none">
              Three flows.{" "}
              <span className="text-gradient-ems">One city.</span>
              <br />Real money.
            </h2>
          </AnimateIn>

          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {[
              {
                icon: "🎤",
                title: "Artists upload",
                step: "01",
                color: "border-brand-500/25 bg-brand-500/5",
                accent: "text-brand-400",
                topBar: "from-brand-500 to-brand-700",
                desc: "Upload tracks, set the number of licenses available and a revenue-share percentage. Earn every time your song streams.",
              },
              {
                icon: "🎟️",
                title: "Fans license",
                step: "02",
                color: "border-accent-500/25 bg-accent-500/5",
                accent: "text-accent-400",
                topBar: "from-accent-500 to-accent-700",
                desc: "Buy digital licenses — each entitles you to a defined share of that song's streaming revenue, paid out quarterly.",
              },
              {
                icon: "💸",
                title: "Everyone earns",
                step: "03",
                color: "border-gold-500/25 bg-gold-500/5",
                accent: "text-gold-400",
                topBar: "from-gold-500 to-gold-700",
                desc: "As the song streams, EMS distributes revenue automatically. Artists keep their share; license holders receive theirs.",
              },
            ].map((item, i) => (
              <AnimateIn key={item.title} delay={i * 120} direction="up">
                <div className={`group relative rounded-2xl border ${item.color} overflow-hidden card-hover-neon spotlight-card h-full`}>
                  {/* Top accent bar */}
                  <div className={`h-px w-full bg-gradient-to-r ${item.topBar} opacity-60`} />
                  <div className="p-8">
                    {/* Step + icon */}
                    <div className="mb-6 flex items-start justify-between">
                      <div className="text-5xl transition-transform duration-300 group-hover:scale-110">{item.icon}</div>
                      <span className={`font-display font-black text-5xl opacity-15 ${item.accent}`}>{item.step}</span>
                    </div>
                    <h3 className={`mb-3 text-xl font-bold ${item.accent}`}>{item.title}</h3>
                    <p className="text-sm leading-relaxed text-white/55">{item.desc}</p>
                  </div>
                </div>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── DIVIDER ───────────────────────────────────────── */}
      <div className="w-full max-w-4xl px-4">
        <div className="divider-glow" />
      </div>

      {/* ── DISCOVER THE CITY ─────────────────────────────────── */}
      <section className="w-full px-4 py-32 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[#080808]" />
        <div className="pointer-events-none absolute inset-0 grid-lines opacity-25" />

        <div className="relative mx-auto max-w-6xl">
          <AnimateIn className="mb-16 text-center">
            <span className="inline-block text-xs font-bold tracking-[0.2em] uppercase text-accent-400 bg-accent-500/8 border border-accent-500/20 rounded-full px-4 py-1.5 mb-5">
              Districts
            </span>
            <h2 className="font-display font-black text-[clamp(2.5rem,6vw,5rem)] uppercase tracking-tight leading-none">
              Navigate the{" "}
              <span className="text-gradient-ems">City</span>
            </h2>
            <p className="mt-4 text-white/40 text-lg max-w-xl mx-auto">
              Songs are ranked into districts. The higher you climb, the more exposure you get.
            </p>
          </AnimateIn>

          <div className="grid gap-5 md:grid-cols-3">
            {[
              {
                icon: "👑",
                name: "Label Row",
                rank: "#1",
                desc: "Elite label-backed artists. Highest visibility and premium placement.",
                glow: "glow-gold",
                border: "border-gold-500/35",
                bg: "bg-gold-500/4",
                text: "text-gold-400",
                topBar: "from-gold-500 to-gold-700",
                badge: "ELITE",
                badgeClass: "bg-gold-500/15 text-gold-400 border-gold-500/30",
              },
              {
                icon: "🏙️",
                name: "Downtown Prime",
                rank: "#2",
                desc: "High-performers unlocked by AI score. Prime real estate.",
                glow: "glow-purple",
                border: "border-brand-500/35",
                bg: "bg-brand-500/5",
                text: "text-brand-400",
                topBar: "from-brand-500 to-brand-700",
                badge: "PRIME",
                badgeClass: "bg-brand-500/15 text-brand-400 border-brand-500/30",
              },
              {
                icon: "🔮",
                name: "Indie Blocks",
                rank: "#3",
                desc: "The starting grid — your launchpad to the top.",
                glow: "",
                border: "border-accent-500/25",
                bg: "bg-accent-500/4",
                text: "text-accent-400",
                topBar: "from-accent-500 to-accent-700",
                badge: "ENTRY",
                badgeClass: "bg-accent-500/10 text-accent-400 border-accent-500/25",
              },
            ].map((d, i) => (
              <AnimateIn key={d.name} delay={i * 100} direction="up">
                <div className={`group relative rounded-2xl border ${d.border} ${d.bg} overflow-hidden card-hover-neon text-center spotlight-card`}>
                  <div className={`h-px w-full bg-gradient-to-r ${d.topBar} opacity-50`} />
                  <div className="p-8">
                    <div className="mb-4 text-5xl transition-transform duration-300 group-hover:scale-110">{d.icon}</div>
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <p className={`font-display font-black text-2xl uppercase tracking-wide ${d.text}`}>{d.name}</p>
                    </div>
                    <span className={`inline-block text-[10px] font-bold tracking-[0.15em] uppercase border rounded-full px-3 py-0.5 mb-4 ${d.badgeClass}`}>
                      {d.badge}
                    </span>
                    <p className="text-sm text-white/45 leading-relaxed">{d.desc}</p>
                  </div>
                </div>
              </AnimateIn>
            ))}
          </div>

          <AnimateIn className="mt-10 text-center" delay={300}>
            <Link
              href="/city"
              className="inline-flex items-center gap-2 rounded-xl border border-white/12 px-8 py-3.5 text-sm font-semibold text-white/70 hover:bg-white/7 hover:text-white transition-all duration-300 hover:border-brand-500/40"
            >
              View the City map
              <span className="text-brand-400">→</span>
            </Link>
          </AnimateIn>
        </div>
      </section>

      {/* ── FEATURE HIGHLIGHTS ───────────────────────────────── */}
      <section className="w-full px-4 py-28 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#080808] via-[#0d0812] to-[#080808]" />
        <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 h-px w-3/4 bg-gradient-to-r from-transparent via-brand-500/30 to-transparent" />

        <div className="relative mx-auto max-w-6xl">
          <AnimateIn className="mb-16 text-center">
            <h2 className="font-display font-black text-[clamp(2.5rem,6vw,5rem)] uppercase tracking-tight leading-none">
              Everything you need to{" "}
              <span className="text-gradient-ems">dominate</span>
            </h2>
          </AnimateIn>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: "⚔️", title: "Versus Battles", desc: "Head-to-head song battles. The crowd decides who rises.", href: "/versus", color: "text-red-400" },
              { icon: "🤖", title: "AI Scoring", desc: "Our AI engine scores every track and ranks it in the city.", href: "/ai", color: "text-brand-400" },
              { icon: "📊", title: "Live Charts", desc: "Real-time leaderboards updated as votes and plays roll in.", href: "/leaderboard", color: "text-accent-400" },
              { icon: "🏷️", title: "Label Deals", desc: "Get signed by virtual labels or build your own empire.", href: "/label", color: "text-gold-400" },
            ].map((f, i) => (
              <AnimateIn key={f.title} delay={i * 80}>
                <Link href={f.href} className="group block rounded-2xl border border-white/8 bg-white/2 p-6 card-hover-neon h-full">
                  <div className={`mb-4 text-3xl transition-transform duration-300 group-hover:scale-110 group-hover:${f.color}`}>{f.icon}</div>
                  <h3 className={`mb-2 font-bold text-base ${f.color}`}>{f.title}</h3>
                  <p className="text-xs text-white/45 leading-relaxed">{f.desc}</p>
                  <span className="mt-4 inline-block text-xs text-white/30 group-hover:text-white/60 transition-colors">
                    Explore →
                  </span>
                </Link>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BAND ─────────────────────────────────────────── */}
      <section className="w-full px-4 py-24 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-brand-900/30 via-brand-800/20 to-accent-700/15" />
        <div className="pointer-events-none absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-500/40 to-transparent" />
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent-500/30 to-transparent" />

        <AnimateIn className="relative mx-auto max-w-3xl text-center">
          <h2 className="font-display font-black text-[clamp(2.5rem,7vw,6rem)] uppercase tracking-tight leading-none mb-6">
            Ready to own your{" "}
            <span className="text-gradient-ems">sound?</span>
          </h2>
          <p className="mb-10 text-white/45 text-lg max-w-xl mx-auto">
            Join thousands of artists and fans already building the future of music.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/auth/signup" className="btn-primary text-base px-10 py-4 rounded-2xl">
              Start for free
            </Link>
            <Link
              href="/marketplace"
              className="rounded-2xl border border-white/15 px-10 py-4 text-base font-semibold text-white/70 hover:bg-white/7 hover:text-white transition-all duration-300"
            >
              Browse marketplace
            </Link>
          </div>
        </AnimateIn>
      </section>

      {/* ── LEGAL NOTICE ─────────────────────────────────────── */}
      <section className="w-full border-t border-white/6 px-4 py-10 text-center text-xs text-white/20">
        <p className="mx-auto max-w-3xl leading-relaxed">
          Epic Music Space licenses are{" "}
          <strong className="text-white/35">digital content licenses</strong>, not
          securities or financial instruments. They do not represent equity, debt, or
          investment contracts of any kind. Revenue participation is contractual and
          limited to streaming royalties as defined in your{" "}
          <Link href="/legal/licensing" className="underline hover:text-white/45 transition-colors">
            Licensing Agreement
          </Link>
          . Past performance does not guarantee future earnings. Please review our{" "}
          <Link href="/legal/terms" className="underline hover:text-white/45 transition-colors">
            Terms of Service
          </Link>{" "}
          before purchasing.
        </p>
      </section>
    </div>
  );
}

