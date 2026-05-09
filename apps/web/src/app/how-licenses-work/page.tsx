import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How Licenses Work",
  description:
    "Plain-English guide to Epic Music Space digital licenses — what you buy, how revenue share works, what happens if a song flops, and what protects you.",
  alternates: { canonical: "/how-licenses-work" },
};

const faqStructuredData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What am I actually buying?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "A digital license — a contractual right to receive a pro-rata share of the Net Streaming Revenue that song earns. You're not buying a security, equity, or copyright. You're buying a slice of the song's future streaming income for as long as it streams.",
      },
    },
    {
      "@type": "Question",
      name: "What happens if the song never makes money?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "You make $0 in revenue share. Licenses are not investments and have no guaranteed return. If you want predictable returns, this is not the right product. If you want to support an artist you believe in and share in any upside they earn, this is.",
      },
    },
    {
      "@type": "Question",
      name: "Is this a security or investment contract?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. EMS licenses are digital content licenses, not securities, investment contracts, or equity instruments. They are contractual rights to a defined share of streaming royalties — same legal category as a music sync license, not a stock or token.",
      },
    },
    {
      "@type": "Question",
      name: "What happens if Epic Music Space shuts down?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Your contractual right to revenue share survives — it's a direct agreement between you and the artist, with EMS as the operator of the royalty pipeline. We publish a wind-down plan committing to either transfer pipeline operations to a successor or distribute remaining held royalties before shutdown.",
      },
    },
    {
      "@type": "Question",
      name: "What if the artist removes the song?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Listings sold-out or removed before delivery are auto-refunded. After delivery, the license remains valid for revenue share on streams that occurred while the song was live. The artist cannot retroactively cancel licenses already sold.",
      },
    },
  ],
};

export default function HowLicensesWorkPage() {
  return (
    <main className="relative min-h-screen text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />

      <div className="relative mx-auto max-w-4xl px-4 py-12 md:px-6 md:py-16">
        {/* Hero — plain-English promise + 60-second summary */}
        <section className="studio-faceplate relative rounded-xl p-6 sm:p-10">
          <div aria-hidden className="studio-walnut absolute left-0 top-0 bottom-0 w-3 rounded-l-xl" />
          <div aria-hidden className="studio-walnut absolute right-0 top-0 bottom-0 w-3 rounded-r-xl" />
          <span aria-hidden className="studio-screw absolute left-5 top-3" />
          <span aria-hidden className="studio-screw absolute right-5 top-3" />
          <span aria-hidden className="studio-screw absolute left-5 bottom-3" />
          <span aria-hidden className="studio-screw absolute right-5 bottom-3" />

          <div className="ml-3 mr-3">
            <p className="studio-label text-tube-300">◉ How Licenses Work</p>
            <h1 className="mt-3 font-display text-3xl uppercase tracking-wider text-white sm:text-5xl">
              You buy a slice of a song.
              <br />
              <span className="text-tube-300">When it earns, you earn.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/75">
              No jargon, no fine print up front. Here&apos;s the whole deal in
              one paragraph: an artist lists a song with a price and a revenue
              share. You buy a license. From that moment forward, every time
              that song earns streaming revenue, you get your share — split
              evenly with everyone else who bought a license. That&apos;s it.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {[
                "Plain English first",
                "Real example below",
                "Trust questions answered",
              ].map((p) => (
                <span
                  key={p}
                  className="rounded-md studio-faceplate-dark px-3 py-1.5 studio-label text-white/65"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Worked example with numbers */}
        <section className="mt-10">
          <p className="studio-label text-tube-300">◉ Worked Example</p>
          <h2 className="mt-3 font-display text-2xl uppercase tracking-wider text-white sm:text-4xl">
            What the math actually looks like.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/65">
            Numbers are the easiest way to make this real. Here&apos;s a single
            song, beginning to end.
          </p>

          <div className="mt-6 space-y-3">
            {[
              {
                step: "01",
                label: "The Listing",
                body: (
                  <>
                    An artist lists their song at <strong className="text-white">$25 per license</strong>,{" "}
                    <strong className="text-white">100 licenses total</strong>, with a{" "}
                    <strong className="text-white">10% revenue share</strong> across all licenses.
                  </>
                ),
              },
              {
                step: "02",
                label: "Your Purchase",
                body: (
                  <>
                    You buy <strong className="text-white">1 license</strong> for $25.
                    EMS keeps a flat 10% platform fee ($2.50). The artist receives $22.50.
                    You now hold 1 of 100 licenses on this song.
                  </>
                ),
              },
              {
                step: "03",
                label: "Your Share",
                body: (
                  <>
                    The 10% revenue share is split evenly among the 100 licenses.
                    Your slice = <strong className="text-white">10% ÷ 100 = 0.1%</strong>{" "}
                    of every dollar of Net Streaming Revenue this song generates.
                  </>
                ),
              },
              {
                step: "04",
                label: "If The Song Earns $10,000",
                body: (
                  <>
                    10% goes to license holders → $1,000 split 100 ways →{" "}
                    <strong className="text-white">$10 to you</strong>. Paid quarterly.
                    Continues every quarter the song keeps streaming.
                  </>
                ),
              },
              {
                step: "05",
                label: "If The Song Earns $0",
                body: (
                  <>
                    You earn $0 in revenue share. The license is still yours
                    — if the song catches on later, your share kicks in.
                    But there is no guarantee, and we will not pretend there is.
                  </>
                ),
              },
            ].map((row) => (
              <div
                key={row.step}
                className="studio-faceplate relative grid gap-3 rounded-xl p-5 sm:grid-cols-[auto_1fr] sm:items-baseline sm:gap-6"
              >
                <span aria-hidden className="studio-screw absolute left-2 top-2" />
                <span aria-hidden className="studio-screw absolute right-2 top-2" />
                <div className="flex items-baseline gap-3">
                  <span className="text-readout-amber font-display text-2xl font-bold tabular-nums">
                    {row.step}
                  </span>
                  <span className="studio-label text-white/55">{row.label}</span>
                </div>
                <p className="text-sm leading-relaxed text-white/80">{row.body}</p>
              </div>
            ))}
          </div>

          <p className="mt-5 text-xs text-white/45">
            Net Streaming Revenue and the exact royalty pipeline are defined
            in the <Link href="/legal/licensing" className="underline decoration-dotted underline-offset-2 hover:text-white/70">Licensing Agreement</Link>. Numbers above are an
            illustration, not a forecast.
          </p>
        </section>

        {/* What protects you — the trust answers */}
        <section className="mt-12">
          <p className="studio-label text-tube-300">◉ What Protects You</p>
          <h2 className="mt-3 font-display text-2xl uppercase tracking-wider text-white sm:text-4xl">
            The questions a smart buyer asks.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/65">
            Direct answers, no marketing. If any of these worry you, the
            answer is the answer — read it and decide.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {[
              {
                q: "What if the song never makes money?",
                a: "You make $0 in revenue share. Licenses are not investments and there is no guaranteed return. Only buy what you can support an artist with — treat any earnings as upside, not income.",
              },
              {
                q: "Is this a security or an investment contract?",
                a: "No. EMS licenses are digital content licenses — same legal category as a music sync license, not a stock or token. They convey contractual rights to a share of streaming royalties, not equity, debt, or ownership.",
              },
              {
                q: "What if Epic Music Space shuts down?",
                a: "The contract is between you and the artist. EMS operates the royalty pipeline, but your right to revenue share is a direct contractual right that survives. Our wind-down plan commits to either transferring pipeline operations or distributing remaining held royalties before shutdown.",
              },
              {
                q: "What if the artist removes the song?",
                a: "Listings sold-out or removed before delivery are auto-refunded. After delivery, your license stays valid for revenue share on streams that occurred while the song was live. Artists cannot retroactively cancel licenses already sold.",
              },
              {
                q: "Can I resell my license?",
                a: "No. Licenses are non-transferable. Your license stays attached to the wallet/account that bought it. We made this choice deliberately — it keeps the system out of speculative-asset territory and out of SEC jurisdiction.",
              },
              {
                q: "How do payouts actually reach me?",
                a: "Quarterly. Royalties are calculated, EMS deducts the platform fee, and the remaining license-holder pool is paid out via Stripe / PayPal / Cash App on file. You can see every payout breakdown in your wallet.",
              },
            ].map((item) => (
              <article
                key={item.q}
                className="studio-rack-card flex flex-col gap-2"
              >
                <p className="studio-rack-slot">
                  <span className="num">Q</span>
                </p>
                <h3 className="font-display text-lg uppercase leading-tight tracking-wide text-white">
                  {item.q}
                </h3>
                <p className="text-sm leading-relaxed text-white/70">{item.a}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Pricing transparency strip */}
        <section className="mt-12">
          <div className="studio-faceplate relative rounded-xl p-6 sm:p-8">
            <span aria-hidden className="studio-screw absolute left-2 top-2" />
            <span aria-hidden className="studio-screw absolute right-2 top-2" />
            <span aria-hidden className="studio-screw absolute left-2 bottom-2" />
            <span aria-hidden className="studio-screw absolute right-2 bottom-2" />
            <div className="grid gap-6 sm:grid-cols-3">
              <div className="studio-screen rounded-md p-4">
                <p className="studio-label relative z-10 text-white/45">Platform fee</p>
                <p className="text-readout-amber relative z-10 mt-1 text-3xl font-bold tabular-nums">
                  10%
                </p>
                <p className="relative z-10 mt-1 text-xs text-white/55">
                  Flat. Itemized on every payout. No hidden cuts.
                </p>
              </div>
              <div className="studio-screen rounded-md p-4">
                <p className="studio-label relative z-10 text-white/45">To the artist</p>
                <p className="text-readout-amber relative z-10 mt-1 text-3xl font-bold tabular-nums">
                  90%
                </p>
                <p className="relative z-10 mt-1 text-xs text-white/55">
                  Of every license sale, paid out per their schedule.
                </p>
              </div>
              <div className="studio-screen rounded-md p-4">
                <p className="studio-label relative z-10 text-white/45">Refund window</p>
                <p className="text-readout-amber relative z-10 mt-1 text-3xl font-bold tabular-nums">
                  Auto
                </p>
                <p className="relative z-10 mt-1 text-xs text-white/55">
                  Sold-out or removed listings refund automatically.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA + legal links */}
        <section className="mt-12">
          <div className="studio-faceplate relative rounded-xl p-6 text-center sm:p-10">
            <div aria-hidden className="studio-walnut absolute left-0 top-0 bottom-0 w-3 rounded-l-xl" />
            <div aria-hidden className="studio-walnut absolute right-0 top-0 bottom-0 w-3 rounded-r-xl" />
            <span aria-hidden className="studio-screw absolute left-5 top-3" />
            <span aria-hidden className="studio-screw absolute right-5 top-3" />
            <span aria-hidden className="studio-screw absolute left-5 bottom-3" />
            <span aria-hidden className="studio-screw absolute right-5 bottom-3" />

            <div className="ml-3 mr-3">
              <p className="studio-label text-tube-300">◉ Ready?</p>
              <h2 className="mt-3 font-display text-2xl uppercase tracking-wider text-white sm:text-4xl">
                Browse the catalog.
                <br />
                <span className="text-tube-300">Find an artist worth supporting.</span>
              </h2>
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href="/marketplace"
                  className="studio-engage-btn rounded-md px-6 py-3 font-display text-base uppercase tracking-[0.18em]"
                >
                  Browse the catalog →
                </Link>
                <Link
                  href="/auth/signup?role=ARTIST"
                  className="rounded-md studio-faceplate-dark px-6 py-3 font-display text-base uppercase tracking-[0.18em] text-white/85 hover:text-white"
                >
                  I&apos;m an artist →
                </Link>
              </div>
              <p className="mt-6 text-xs text-white/45">
                Want the legal documents?{" "}
                <Link
                  href="/legal/licensing"
                  className="underline decoration-dotted underline-offset-2 hover:text-white/70"
                >
                  Full licensing agreement
                </Link>{" "}
                ·{" "}
                <Link
                  href="/license-agreement"
                  className="underline decoration-dotted underline-offset-2 hover:text-white/70"
                >
                  Standard license terms
                </Link>{" "}
                ·{" "}
                <Link
                  href="/legal/refunds"
                  className="underline decoration-dotted underline-offset-2 hover:text-white/70"
                >
                  Refund policy
                </Link>
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
