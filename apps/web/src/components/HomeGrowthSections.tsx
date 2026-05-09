import Link from "next/link";

const trustItems = [
  { label: "Master ownership", body: "Artists keep control of their catalog and set their own license terms." },
  { label: "Flat 10% fee", body: "No mystery math. Platform fee is stated up front and itemized on payouts." },
  { label: "Plain-English licenses", body: "Buyers see rights, supply, price, and revenue share before checkout." },
  { label: "Copyright-ready", body: "DMCA, privacy, terms, and license pages are visible before purchase." },
];

const switchReasons = [
  "One profile replaces six disconnected links",
  "Upload, score, license, and promote from the same studio",
  "Live rooms turn drops into events instead of silent uploads",
  "Fan votes and battles create visible momentum",
  "License buyers become part of the artist's growth loop",
  "Artists get clear next steps instead of guessing what to do next",
];

const onboardingSteps = [
  { title: "Claim studio", body: "Lock your artist URL, avatar, bio, links, and payout readiness." },
  { title: "Upload track", body: "Add audio, cover art, genre, BPM, key, price, and license supply." },
  { title: "Go live", body: "Host a listening room, invite fans, and push the track into discovery." },
  { title: "Grow", body: "Track score, follows, licenses, votes, and the next best action." },
];

const testimonials = [
  { quote: "EMS feels like my artist HQ, not another upload form.", name: "Independent artist", tag: "Beta creator" },
  { quote: "The license terms are clear before I even click checkout.", name: "Video creator", tag: "Music buyer" },
  { quote: "Battles and rooms make a release feel alive again.", name: "Producer", tag: "Studio user" },
];

const activity = [
  "A creator previewed a cinematic cue and saved it to a project folder",
  "An artist finished studio setup and moved to first upload",
  "A listener followed a rising producer after a live room",
  "A buyer compared license supply, price, and rights before checkout",
  "A track gained momentum from score, votes, and catalog activity",
];

export default function HomeGrowthSections() {
  return (
    <>
      <section className="relative z-[5] border-y border-white/10 bg-black/45 backdrop-blur">
        <div className="mx-auto grid max-w-6xl gap-3 px-4 py-5 sm:grid-cols-2 lg:grid-cols-4">
          {trustItems.map((item) => (
            <div key={item.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="studio-label text-tube-300">Verified Trust</p>
              <h3 className="mt-2 font-display text-lg uppercase tracking-wide text-white">{item.label}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/60">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="launchpad" className="sticky top-[72px] z-20 mx-auto hidden max-w-6xl px-4 py-3 lg:block">
        <nav className="flex items-center justify-between rounded-2xl border border-tube-400/25 bg-black/80 px-4 py-3 shadow-2xl shadow-tube-900/20 backdrop-blur" aria-label="Creator launchpad">
          <span className="studio-label text-tube-300">Creator Launchpad</span>
          <div className="flex items-center gap-2">
            <Link href="/studio/try" className="rounded-md border border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/80 hover:text-white">Try Studio</Link>
            <Link href="/auth/signup?role=ARTIST" className="rounded-md border border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/80 hover:text-white">Claim Profile</Link>
            <Link href="/studio/new" className="rounded-md border border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/80 hover:text-white">Upload</Link>
            <Link href="/marketplace" className="studio-engage-btn rounded-md px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em]">Browse Licenses</Link>
          </div>
        </nav>
      </section>

      <section className="relative z-[1] mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div>
            <p className="studio-label text-tube-300">◉ Why artists switch to EMS</p>
            <h2 className="mt-3 font-display text-3xl uppercase tracking-wider text-white sm:text-5xl">
              Stop scattering your career across apps.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/60">
              Artists do not need another link-in-bio page. They need a command center that turns attention into community, licensing, and repeatable growth.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {switchReasons.map((reason) => (
                <div key={reason} className="studio-rack-card p-4">
                  <p className="text-sm font-semibold text-white">{reason}</p>
                </div>
              ))}
            </div>
          </div>

          <aside className="studio-faceplate rounded-2xl p-5">
            <div className="mb-4 flex items-center gap-2">
              <span className="led-on-green h-2 w-2 rounded-full" aria-hidden />
              <h3 className="studio-label-lg text-white/85">Live activity</h3>
              <span className="studio-label ml-auto text-white/35">Beta pulse</span>
            </div>
            <div className="space-y-3">
              {activity.map((event, index) => (
                <div key={event} className="rounded-xl border border-white/10 bg-black/40 p-3">
                  <p className="studio-label text-white/35">{String(index + 1).padStart(2, "0")} / Recent signal</p>
                  <p className="mt-1 text-sm leading-relaxed text-white/70">{event}</p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section className="relative z-[1] mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="studio-label text-tube-300">◉ Onboarding progress UX</p>
            <h2 className="mt-3 font-display text-3xl uppercase tracking-wider text-white sm:text-5xl">
              Give every artist a next move.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-white/60">
              The dashboard should never feel empty. Every creator should see a progress path, a completion score, and one action that gets them closer to release revenue.
            </p>
            <Link href="/auth/signup?role=ARTIST" className="studio-engage-btn mt-6 inline-flex rounded-md px-6 py-3 font-display text-base uppercase tracking-[0.18em]">
              Start artist setup →
            </Link>
          </div>
          <div className="studio-faceplate rounded-2xl p-5">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="studio-label text-tube-300">Artist setup</p>
                <h3 className="font-display text-2xl uppercase tracking-wide text-white">68% ready to launch</h3>
              </div>
              <div className="studio-screen rounded-lg px-4 py-2">
                <p className="text-readout-amber relative z-10 text-2xl font-bold">+32</p>
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-[68%] rounded-full bg-tube-400" />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {onboardingSteps.map((step, index) => (
                <div key={step.title} className="rounded-xl border border-white/10 bg-black/40 p-4">
                  <p className="studio-label text-white/35">Step {index + 1}</p>
                  <h4 className="mt-1 font-display text-lg uppercase tracking-wide text-white">{step.title}</h4>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-[1] mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="studio-label text-tube-300">◉ Premium marketplace feel</p>
            <h2 className="mt-3 font-display text-3xl uppercase tracking-wider text-white sm:text-5xl">Tracks should look valuable before they play.</h2>
          </div>
          <Link href="/marketplace" className="rounded-md border border-white/10 px-4 py-3 font-display text-sm uppercase tracking-[0.18em] text-white/80 hover:text-white">Open marketplace →</Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {["Cinematic sync", "Creator-safe hooks", "Limited license supply"].map((title, index) => (
            <div key={title} className="group rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-5 shadow-2xl shadow-black/30 transition hover:-translate-y-1 hover:border-tube-400/40">
              <div className="mb-4 flex h-28 items-end rounded-xl border border-white/10 bg-black/50 p-3">
                <div className="flex w-full items-end gap-1">
                  {Array.from({ length: 22 }).map((_, i) => (
                    <span key={i} className="w-full rounded-sm bg-tube-400/60" style={{ height: `${20 + ((i * 17 + index * 11) % 64)}%` }} />
                  ))}
                </div>
              </div>
              <p className="studio-label text-tube-300">EMS curated</p>
              <h3 className="mt-2 font-display text-2xl uppercase tracking-wide text-white">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/60">Show BPM, key, score, price, claimed supply, rights summary, and a clear license CTA on every card.</p>
              <div className="mt-4 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.16em] text-white/55">
                <span className="rounded border border-white/10 px-2 py-1">BPM</span>
                <span className="rounded border border-white/10 px-2 py-1">Key</span>
                <span className="rounded border border-white/10 px-2 py-1">Score</span>
                <span className="rounded border border-white/10 px-2 py-1">Rights</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="relative z-[1] mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <div className="mb-8">
          <p className="studio-label text-tube-300">◉ Creator proof</p>
          <h2 className="mt-3 font-display text-3xl uppercase tracking-wider text-white sm:text-5xl">Make beta feel established.</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {testimonials.map((item) => (
            <figure key={item.quote} className="studio-rack-card p-5">
              <blockquote className="text-lg leading-relaxed text-white">“{item.quote}”</blockquote>
              <figcaption className="mt-5 border-t border-white/10 pt-4">
                <p className="font-semibold text-white">{item.name}</p>
                <p className="studio-label mt-1 text-tube-300">{item.tag}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-black/90 p-3 backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-3 gap-2">
          <Link href="/studio/try" className="rounded-lg border border-white/10 px-3 py-3 text-center text-xs font-bold uppercase tracking-[0.14em] text-white/80">Try</Link>
          <Link href="/auth/signup?role=ARTIST" className="studio-engage-btn rounded-lg px-3 py-3 text-center text-xs font-bold uppercase tracking-[0.14em]">Artist</Link>
          <Link href="/marketplace" className="rounded-lg border border-white/10 px-3 py-3 text-center text-xs font-bold uppercase tracking-[0.14em] text-white/80">Browse</Link>
        </div>
      </section>
    </>
  );
}
