"use client";

import Link from "next/link";
import EMSWorldIntro from "@/components/EMSWorldIntro";

const worldCards = [
  {
    title: "Studio",
    body: "Desktop-first AI music creation built for hip-hop and R&B creators. Record vocals, arrange tracks, export stems, and finish real records.",
    href: "/studio/try",
    icon: "🎙️",
  },
  {
    title: "Mobile Flow",
    body: "Start ideas on your phone, review sessions anywhere, and move projects into the full desktop studio when it is time to finish.",
    href: "/get-the-app",
    icon: "📱",
  },
  {
    title: "Marketplace",
    body: "Sell beats, loops, templates, licenses, engineering, and creative services directly to artists and producers.",
    href: "/marketplace",
    icon: "💿",
  },
  {
    title: "Collaboration",
    body: "Premium creator collaboration with shared sessions, stem exchange, review tools, and pro workflows.",
    href: "/studio/try",
    icon: "🤝",
  },
];

const doctrine = [
  "Hip-hop & R&B first",
  "Desktop web is the full studio",
  "Phone is for fast creation and review",
  "Artist-friendly commercial rights",
  "Premium-quality exports and stems",
  "Collaboration for Pro and Studio tiers",
];

const creatorPlans = [
  {
    tier: "Free",
    focus: "Try the magic",
    details: "Limited AI generations, mobile idea capture, MP3 exports, and a recording trial.",
  },
  {
    tier: "Creator",
    focus: "Release real music",
    details: "Commercial rights, WAV exports, recording access, templates, and expanded AI credits.",
  },
  {
    tier: "Pro",
    focus: "Serious production",
    details: "Stem export, priority AI generation, premium audio quality, collaboration, and advanced workflow tools.",
  },
];

export default function SimplifiedHomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#030307] text-white">
      <EMSWorldIntro />

      <section className="relative overflow-hidden border-b border-white/10 px-4 py-20 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,.18),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(255,45,146,.16),transparent_30%)]" />

        <div className="relative mx-auto flex max-w-7xl flex-col gap-12 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <p className="inline-flex rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.32em] text-cyan-100">
              Hip-Hop & R&B Creator Platform
            </p>

            <h1 className="mt-6 font-display text-5xl uppercase leading-[0.9] tracking-[0.04em] text-white sm:text-7xl lg:text-8xl">
              Build tracks.
              <br />
              Export records.
              <br />
              Own the moment.
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-8 text-white/70 sm:text-lg">
              Epic Music Space is a hybrid AI music workspace built for hip-hop, R&B, and independent creators. Start ideas on your phone, finish records on desktop, export professional stems, and collaborate across your entire creative world.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/studio/try"
                className="inline-flex min-h-14 items-center justify-center rounded-full border border-cyan-300/55 bg-cyan-300/16 px-8 py-4 text-center font-display text-sm uppercase tracking-[0.24em] text-cyan-100 shadow-[0_0_38px_rgba(34,211,238,.24)] transition hover:scale-[1.02] hover:bg-cyan-300/25"
              >
                Open Studio
              </Link>

              <Link
                href="/get-the-app"
                className="inline-flex min-h-14 items-center justify-center rounded-full border border-pink-300/35 bg-pink-300/10 px-8 py-4 text-center font-display text-sm uppercase tracking-[0.24em] text-pink-100 transition hover:scale-[1.02] hover:bg-pink-300/18"
              >
                Start on Mobile
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap gap-2">
              {doctrine.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-white/62"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="grid w-full max-w-xl gap-4">
            {worldCards.map((item) => (
              <Link
                key={item.title}
                href={item.href}
                className="rounded-2xl border border-white/10 bg-black/45 p-6 backdrop-blur-xl transition hover:-translate-y-1 hover:border-cyan-300/45 hover:bg-white/[.06]"
              >
                <div className="flex items-center gap-4">
                  <span className="text-3xl">{item.icon}</span>
                  <div>
                    <h2 className="font-display text-2xl uppercase tracking-wide text-white">
                      {item.title}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-white/62">
                      {item.body}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-sm font-black uppercase tracking-[0.28em] text-cyan-200/75">
              Studio v1 Doctrine
            </p>
            <h2 className="mt-4 font-display text-4xl uppercase tracking-wide text-white sm:text-5xl">
              Built for creators who actually finish music.
            </h2>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <h3 className="font-display text-2xl uppercase tracking-wide text-white">
                Desktop Studio
              </h3>
              <p className="mt-3 text-sm leading-7 text-white/65">
                The full production workflow lives on desktop web: recording, arrangement, timeline editing, AI-assisted generation, exporting, stems, and collaboration.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <h3 className="font-display text-2xl uppercase tracking-wide text-white">
                Mobile Creation
              </h3>
              <p className="mt-3 text-sm leading-7 text-white/65">
                Mobile is optimized for speed — capture ideas, preview beats, review sessions, export drafts, and keep your workflow moving anywhere.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <h3 className="font-display text-2xl uppercase tracking-wide text-white">
                Artist Ownership
              </h3>
              <p className="mt-3 text-sm leading-7 text-white/65">
                Commercial rights are clear and creator-friendly. Export high-quality WAVs, FLACs, MIDI, and professional stems for release-ready workflows.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-black uppercase tracking-[0.28em] text-pink-200/75">
                Creator Packages
              </p>
              <h2 className="mt-4 font-display text-4xl uppercase tracking-wide text-white sm:text-5xl">
                Simple plans built around real music workflows.
              </h2>
            </div>

            <Link
              href="/studio/try"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-cyan-300/55 bg-cyan-300/16 px-6 py-3 text-center font-display text-sm uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-300/24"
            >
              Try the Studio
            </Link>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {creatorPlans.map((plan) => (
              <div
                key={plan.tier}
                className="rounded-3xl border border-white/10 bg-black/40 p-8 shadow-[0_0_24px_rgba(0,0,0,.25)]"
              >
                <p className="text-sm font-black uppercase tracking-[0.24em] text-cyan-100">
                  {plan.tier}
                </p>
                <h3 className="mt-4 font-display text-3xl uppercase tracking-wide text-white">
                  {plan.focus}
                </h3>
                <p className="mt-4 text-sm leading-7 text-white/65">
                  {plan.details}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
