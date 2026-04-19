import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex flex-col items-center">
      {/* Hero */}
      <section className="w-full px-4 pt-24 pb-20 text-center">
        <div className="mx-auto max-w-4xl">
          <div className="mb-4 inline-block rounded-full border border-brand-500/40 bg-brand-500/10 px-4 py-1.5 text-sm font-medium text-brand-400">
            Digital Music Licensing Platform
          </div>
          <h1 className="mb-6 text-5xl font-extrabold leading-tight tracking-tight md:text-7xl">
            Own a piece of{" "}
            <span className="bg-gradient-to-r from-brand-400 to-accent-400 bg-clip-text text-transparent">
              the music
            </span>
            <br />
            you love
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg text-white/60">
            Epic Music Space lets independent artists release limited music
            licenses. Fans and investors can hold those licenses and receive a
            share of streaming revenue — forever.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/marketplace"
              className="rounded-xl bg-brand-500 px-8 py-3 text-base font-semibold text-white shadow-lg shadow-brand-500/30 hover:bg-brand-600 transition"
            >
              Browse Marketplace
            </Link>
            <Link
              href="/auth/signup"
              className="rounded-xl border border-white/20 px-8 py-3 text-base font-semibold hover:bg-white/10 transition"
            >
              Create Account
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="w-full border-t border-white/10 bg-white/[0.02] px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-12 text-center text-3xl font-bold">How it works</h2>
          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                icon: "🎤",
                title: "Artists upload",
                desc: "Independent artists upload their tracks and set the number of licenses available, the license price, and their revenue share percentage.",
              },
              {
                icon: "🎟️",
                title: "Fans license",
                desc: "Supporters purchase digital licenses — not stocks, not securities. Owning a license entitles you to a defined share of the song's streaming revenue.",
              },
              {
                icon: "💸",
                title: "Everyone earns",
                desc: "As the song streams, EMS distributes revenue automatically: the artist keeps their share, license holders receive theirs each quarter.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="glass rounded-2xl p-6 text-center"
              >
                <div className="mb-4 text-4xl">{item.icon}</div>
                <h3 className="mb-2 text-lg font-semibold">{item.title}</h3>
                <p className="text-sm text-white/60">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Legal notice */}
      <section className="w-full px-4 py-10 text-center text-xs text-white/30">
        <p className="mx-auto max-w-3xl">
          Epic Music Space licenses are <strong className="text-white/50">digital content licenses</strong>, not
          securities or financial instruments. They do not represent equity,
          debt, or investment contracts of any kind. Revenue participation is
          contractual and limited to streaming royalties as defined in your{" "}
          <Link href="/legal/licensing" className="underline hover:text-white/60">
            Licensing Agreement
          </Link>
          . Past performance does not guarantee future earnings. Please review
          our{" "}
          <Link href="/legal/terms" className="underline hover:text-white/60">
            Terms of Service
          </Link>{" "}
          before purchasing.
        </p>
      </section>
    </div>
  );
}
