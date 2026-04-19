import Link from "next/link";
export default function HomePage() {
    return (<div className="flex flex-col items-center">

      {/* ── HERO / ONBOARDING ─────────────────────────────────── */}
      <section className="relative w-full overflow-hidden bg-city scanlines">
        {/* Ambient orbs */}
        <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 h-[600px] w-[900px] rounded-full bg-brand-500/20 blur-[120px]"/>
        <div className="pointer-events-none absolute top-[40%] right-0 h-[400px] w-[400px] rounded-full bg-accent-500/10 blur-[100px]"/>

        <div className="relative mx-auto max-w-5xl px-4 pb-24 pt-28 text-center">
          {/* Pill badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-500/40 bg-brand-500/10 px-5 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-500 opacity-75"/>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-500"/>
            </span>
            <span className="text-sm font-medium text-brand-400">
              Music Metaverse · Now Live
            </span>
          </div>

          {/* Headline */}
          <h1 className="mb-6 text-5xl font-extrabold leading-[1.08] tracking-tight md:text-7xl">
            Build your studio.{" "}
            <span className="text-gradient-ems">Run your sound.</span>
            <br />
            Own your city.
          </h1>

          <p className="mx-auto mb-12 max-w-2xl text-lg text-white/55">
            Epic Music Space is a futuristic music marketplace. Artists own virtual
            studios, release limited licenses, fans earn revenue share, and brands
            advertise in a living digital city.
          </p>

          {/* Role CTAs */}
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/auth/signup?role=ARTIST" className="group flex items-center gap-3 rounded-2xl border border-brand-500/50 bg-brand-500/15 px-7 py-4 text-sm font-bold tracking-wide transition hover:border-brand-400 hover:bg-brand-500/25 glow-purple-sm">
              <span className="text-2xl">🎤</span>
              <span>
                <span className="block text-brand-400 text-xs uppercase tracking-widest mb-0.5">Creator</span>
                I&apos;m an Artist
              </span>
            </Link>
            <Link href="/auth/signup?role=LISTENER" className="group flex items-center gap-3 rounded-2xl border border-white/15 bg-white/5 px-7 py-4 text-sm font-bold tracking-wide transition hover:border-accent-500/50 hover:bg-accent-500/10">
              <span className="text-2xl">🎧</span>
              <span>
                <span className="block text-accent-400 text-xs uppercase tracking-widest mb-0.5">Fan</span>
                I&apos;m a Listener
              </span>
            </Link>
            <Link href="/auth/signup?role=LABEL" className="group flex items-center gap-3 rounded-2xl border border-gold-500/40 bg-gold-500/8 px-7 py-4 text-sm font-bold tracking-wide transition hover:border-gold-400 hover:bg-gold-500/15">
              <span className="text-2xl">📢</span>
              <span>
                <span className="block text-gold-400 text-xs uppercase tracking-widest mb-0.5">Partner</span>
                I&apos;m a Brand
              </span>
            </Link>
          </div>

          {/* Social proof numbers */}
          <div className="mt-16 flex flex-wrap justify-center gap-8 text-sm text-white/50">
            {[
            { v: "12,400+", l: "Songs licensed" },
            { v: "$840K", l: "Paid to artists" },
            { v: "38,000+", l: "License holders" },
        ].map((s) => (<div key={s.l} className="text-center">
                <p className="text-2xl font-extrabold text-gradient-ems">{s.v}</p>
                <p className="mt-0.5">{s.l}</p>
              </div>))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────── */}
      <section className="w-full border-t border-white/8 px-4 py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-3 text-center text-3xl font-extrabold">
            The EMS economy
          </h2>
          <p className="mb-14 text-center text-white/45">
            Three flows. One city. Real money.
          </p>
          <div className="grid gap-6 md:grid-cols-3">
            {[
            {
                icon: "🎤",
                title: "Artists upload",
                color: "border-brand-500/30 bg-brand-500/8",
                accent: "text-brand-400",
                desc: "Upload tracks, set the number of licenses available and a revenue-share percentage. Earn every time your song streams.",
            },
            {
                icon: "🎟️",
                title: "Fans license",
                color: "border-accent-500/30 bg-accent-500/8",
                accent: "text-accent-400",
                desc: "Buy digital licenses — each entitles you to a defined share of that song's streaming revenue, paid out quarterly.",
            },
            {
                icon: "💸",
                title: "Everyone earns",
                color: "border-gold-500/30 bg-gold-500/8",
                accent: "text-gold-400",
                desc: "As the song streams, EMS distributes revenue automatically. Artists keep their share; license holders receive theirs.",
            },
        ].map((item) => (<div key={item.title} className={`rounded-2xl border p-6 ${item.color} card-hover-neon`}>
                <div className="mb-4 text-4xl">{item.icon}</div>
                <h3 className={`mb-2 text-lg font-bold ${item.accent}`}>{item.title}</h3>
                <p className="text-sm leading-relaxed text-white/60">{item.desc}</p>
              </div>))}
          </div>
        </div>
      </section>

      {/* ── DISCOVER THE CITY ─────────────────────────────────── */}
      <section className="w-full border-t border-white/8 bg-[#0d0d0d] px-4 py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-3 text-center text-3xl font-extrabold">
            Navigate the <span className="text-gradient-ems">City</span>
          </h2>
          <p className="mb-14 text-center text-white/45">
            Songs are ranked into districts. The higher you climb, the more exposure you get.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            {[
            {
                icon: "👑",
                name: "Label Row",
                desc: "Elite label-backed artists. Highest visibility.",
                glow: "glow-gold",
                border: "border-gold-500/40",
                bg: "bg-gold-500/6",
                text: "text-gold-400",
            },
            {
                icon: "🏙️",
                name: "Downtown Prime",
                desc: "High-performers unlocked by AI score.",
                glow: "glow-purple",
                border: "border-brand-500/40",
                bg: "bg-brand-500/8",
                text: "text-brand-400",
            },
            {
                icon: "🔮",
                name: "Indie Blocks",
                desc: "The starting grid — your launchpad.",
                glow: "",
                border: "border-accent-500/30",
                bg: "bg-accent-500/6",
                text: "text-accent-400",
            },
        ].map((d) => (<div key={d.name} className={`rounded-2xl border ${d.border} ${d.bg} p-6 text-center card-hover-neon`}>
                <div className="mb-3 text-4xl">{d.icon}</div>
                <p className={`mb-1 font-bold ${d.text}`}>{d.name}</p>
                <p className="text-xs text-white/50">{d.desc}</p>
              </div>))}
          </div>
          <div className="mt-8 text-center">
            <Link href="/city" className="inline-block rounded-xl border border-white/15 px-8 py-3 text-sm font-semibold hover:bg-white/8 transition">
              View the City map →
            </Link>
          </div>
        </div>
      </section>

      {/* ── LEGAL NOTICE ─────────────────────────────────────── */}
      <section className="w-full border-t border-white/8 px-4 py-10 text-center text-xs text-white/25">
        <p className="mx-auto max-w-3xl">
          Epic Music Space licenses are{" "}
          <strong className="text-white/40">digital content licenses</strong>, not
          securities or financial instruments. They do not represent equity, debt, or
          investment contracts of any kind. Revenue participation is contractual and
          limited to streaming royalties as defined in your{" "}
          <Link href="/legal/licensing" className="underline hover:text-white/50">
            Licensing Agreement
          </Link>
          . Past performance does not guarantee future earnings. Please review our{" "}
          <Link href="/legal/terms" className="underline hover:text-white/50">
            Terms of Service
          </Link>{" "}
          before purchasing.
        </p>
      </section>
    </div>);
}
