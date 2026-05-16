import Link from "next/link";
import EMSWorldIntro from "@/components/EMSWorldIntro";

const workflows = [
  {
    title: "Create",
    body: "Open the studio, sketch an idea, build a beat, and keep your session moving without fighting the interface.",
    href: "/studio/try",
    cta: "Try the studio",
  },
  {
    title: "Collaborate",
    body: "Invite artists, producers, and engineers into the same creative space when the record needs more people.",
    href: "/rooms",
    cta: "Open rooms",
  },
  {
    title: "Sell",
    body: "List beats, services, templates, sounds, and licenses with simple terms buyers can understand fast.",
    href: "/marketplace",
    cta: "View marketplace",
  },
  {
    title: "Discover",
    body: "Find new artists, follow momentum early, vote in battles, and support creators before everybody else catches on.",
    href: "/explore",
    cta: "Explore music",
  },
];

const lanes = [
  ["Artists", "Upload music, host rooms, sell licenses, and grow fans.", "/auth/signup?role=ARTIST"],
  ["Producers", "Sell beats, kits, loops, templates, and collaboration work.", "/marketplace"],
  ["Engineers", "Offer mixing, mastering, tuning, and session services.", "/services"],
  ["Fans", "Discover songs, vote, follow, and support creators early.", "/explore"],
] as const;

const trustPoints = [
  "Artists keep their masters",
  "Clear licensing terms",
  "Secure creator sessions",
  "Simple platform fee",
];

export default function SimplifiedHomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <EMSWorldIntro />
      <section className="mx-auto flex min-h-[78vh] max-w-6xl flex-col justify-center px-4 py-16 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="studio-label mb-4 text-tube-300">Epic Music Space</p>
          <h1 className="font-display text-5xl uppercase leading-[0.92] tracking-wider text-white sm:text-7xl lg:text-8xl">
            Your music workflow in one simple space.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-white/68 sm:text-lg">
            Create music, collaborate in the studio, sell creative services, license sounds, and discover what is moving without being overwhelmed before you start.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/studio/try" className="studio-engage-btn inline-flex min-h-12 items-center justify-center rounded-md px-6 py-3 text-center font-display text-base uppercase tracking-[0.18em]">
              Start creating
            </Link>
            <Link href="/how-licenses-work" className="inline-flex min-h-12 items-center justify-center rounded-md border border-white/15 bg-white/5 px-6 py-3 text-center font-display text-base uppercase tracking-[0.18em] text-white/85 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">
              How it works
            </Link>
          </div>
        </div>

        <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {workflows.map((item) => (
            <Link key={item.title} href={item.href} className="group rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition hover:-translate-y-0.5 hover:border-cyan-300/40 hover:bg-white/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">
              <h2 className="font-display text-2xl uppercase tracking-wide text-white">{item.title}</h2>
              <p className="mt-3 min-h-24 text-sm leading-6 text-white/62">{item.body}</p>
              <p className="mt-4 text-sm font-bold text-tube-300 group-hover:text-tube-200">{item.cta} →</p>
            </Link>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap gap-2" aria-label="Platform trust points">
          {trustPoints.map((point) => (
            <span key={point} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-white/58">
              {point}
            </span>
          ))}
        </div>
      </section>

      <section className="border-t border-white/10 bg-white/[0.02] px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div>
            <p className="studio-label text-tube-300">Choose your lane</p>
            <h2 className="mt-3 font-display text-3xl uppercase tracking-wider text-white sm:text-5xl">
              Every user gets their own path.
            </h2>
            <p className="mt-4 text-sm leading-7 text-white/62">
              EMS should not force everybody into the same screen. Artists, producers, engineers, and fans each need a clean next step.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {lanes.map(([title, body, href]) => (
              <Link key={title} href={href} className="rounded-xl border border-white/10 bg-black/35 p-5 transition hover:border-tube-300/50 hover:bg-black/55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">
                <h3 className="font-display text-xl uppercase tracking-wide text-white">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/60">{body}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 text-center sm:px-6 lg:px-8">
        <p className="studio-label text-tube-300">Simple by design</p>
        <h2 className="mt-3 font-display text-3xl uppercase tracking-wider text-white sm:text-5xl">
          Open the studio. Make the record. Build the business.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/62">
          The front page stays out of the way. The product lets people move through their own workflow instead of overwhelming them before they start.
        </p>
        <Link href="/studio/try" className="studio-engage-btn mt-8 inline-flex min-h-12 items-center justify-center rounded-md px-6 py-3 text-center font-display text-base uppercase tracking-[0.18em]">
          Enter EMS
        </Link>
      </section>
    </main>
  );
}