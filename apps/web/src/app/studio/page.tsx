import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Studio · Make beats, mix, publish",
  description:
    "Open the in-browser DAW, upload a track in 90 seconds, or jump into a live session. Free to start.",
};

// /studio routing rule, per user feedback:
//   Authenticated → go straight to /studio/board (the actual DAW).
//                   No hub, no preamble. The studio IS the studio page.
//   Anonymous     → show the marketing landing below so they get the
//                   pitch + sign-in path.
//
// The old hub (StudioHubClient with "Recent Sessions" etc.) lives on
// at /studio/dashboard for users who want the rail view; the
// dashboard link is reachable from the in-app account menu.
export default async function StudioIndexPage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect("/studio/board");
  }
  return <PublicStudioLanding />;
}

function PublicStudioLanding() {
  return (
    <div className="relative min-h-[calc(100vh-65px)]">
      {/* ============================================================
          STUDIO HERO  ·  walnut-trim mainframe with ON-AIR LEDs
          ============================================================ */}
      <section className="relative z-[1] mx-auto max-w-6xl px-4 pt-10 pb-12 sm:pt-14">
        <div className="studio-faceplate relative rounded-xl p-6 sm:p-12">
          <div
            aria-hidden
            className="studio-walnut absolute left-0 top-0 bottom-0 w-3 rounded-l-xl"
          />
          <div
            aria-hidden
            className="studio-walnut absolute right-0 top-0 bottom-0 w-3 rounded-r-xl"
          />
          <span aria-hidden className="studio-screw absolute left-5 top-3" />
          <span aria-hidden className="studio-screw absolute right-5 top-3" />
          <span aria-hidden className="studio-screw absolute left-5 bottom-3" />
          <span aria-hidden className="studio-screw absolute right-5 bottom-3" />

          <div className="ml-3 mr-3">
            <div className="flex items-center gap-2">
              <span aria-hidden className="led-on-rec h-2 w-2 animate-pulse rounded-full" />
              <p className="studio-label text-rec-400">
                EMS Studio · Live In Your Browser
              </p>
              <span className="studio-label ml-auto text-white/35">
                STU-01 · Public
              </span>
            </div>

            <h1 className="mt-4 font-display text-4xl uppercase leading-[1.05] tracking-wider text-white sm:text-6xl">
              Make a track.
              <br className="hidden sm:block" />
              <span className="text-tube-300"> Sell it. Keep 100%.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg">
              Beat machine, multitrack, mixer, and master chain — all in your
              browser. Publish straight to the EMS marketplace with licensing
              built in. No installs, no plugins, no hidden setup maze.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/studio/try"
                className="studio-engage-btn inline-flex items-center justify-center gap-2 rounded-md px-6 py-4 font-display text-base uppercase tracking-[0.18em]"
              >
                Try it now — no signup →
              </Link>
              <Link
                href="/studio/ultra"
                className="inline-flex items-center justify-center gap-2 rounded-md border border-cyan-300/35 bg-cyan-500/15 px-6 py-4 font-display text-base uppercase tracking-[0.18em] text-cyan-100"
              >
                See Studio Ultra →
              </Link>
              <Link
                href="/auth/signin?callbackUrl=%2Fstudio"
                className="inline-flex items-center justify-center gap-2 rounded-md studio-faceplate-dark px-6 py-4 font-display text-base uppercase tracking-[0.18em] text-white/85 hover:text-white"
              >
                Sign in
              </Link>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                "No installs",
                "Autosave ready",
                "Publish fast",
              ].map((item) => (
                <div key={item} className="studio-screen rounded-md p-3">
                  <p className="studio-label relative z-10 text-white/45">{item}</p>
                </div>
              ))}
            </div>

            {/* Trust LCD readouts */}
            <div className="mt-8 grid max-w-lg grid-cols-3 gap-3">
              {[
                { value: "100%", label: "Artist Take" },
                { value: "$0", label: "Monthly Fee" },
                { value: "90s", label: "First Publish" },
              ].map((s) => (
                <div key={s.label} className="studio-screen rounded-md p-3">
                  <p className="text-readout-amber relative z-10 text-2xl font-bold tabular-nums sm:text-3xl">
                    {s.value}
                  </p>
                  <p className="studio-label relative z-10 mt-1 text-white/45">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          MODULE BAYS  ·  beat machine + mixer + publish
          ============================================================ */}
      <section className="relative z-[1] mx-auto max-w-6xl px-4 pb-12">
        <header className="mb-6">
          <p className="studio-label text-tube-300">
            ◉ Module Bays · What&apos;s In The Rack
          </p>
        </header>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              n: "01",
              slot: "Beat Machine",
              h: "8 lanes. 7 kits.",
              p: "Trap, drill, afro, hyperpop, boom bap, lo-fi, acoustic. Bake patterns into stems and pull them right into the multitrack.",
              cta: "Open the board",
              href: "/studio/try?force-desktop=1",
            },
            {
              n: "02",
              slot: "Multitrack + Mixer",
              h: "Console-grade signal path.",
              p: "Per-track EQ, compression, reverb, delay, sidechain. Master chain with limiter + LUFS metering.",
              cta: "Open the mixer",
              href: "/studio/try?force-desktop=1",
            },
            {
              n: "03",
              slot: "90-Second Publish",
              h: "Three taps to release.",
              p: "Audio → name → price. Ship a track to the EMS marketplace with licensing built in. No gatekeepers.",
              cta: "Try quick upload",
              href: "/studio/try",
            },
            {
              n: "04",
              slot: "Podcaster Console",
              h: "Video-first show workflow.",
              p: "Run episodes like a media product: record for video, keep the audio pristine, cut clips, add captions, and drive listeners into live aftershows.",
              cta: "Open podcast tools",
              href: "/studio/podcast",
            },
            {
              n: "05",
              slot: "Studio Ultra",
              h: "15 major upgrades shipped.",
              p: "See every visual, workflow, AI-assist, and session-reliability upgrade now live on the production studio stack.",
              cta: "View upgrades",
              href: "/studio/ultra",
            },
          ].map((m) => (
            <Link key={m.n} href={m.href} className="studio-rack-card block">
              <p className="studio-rack-slot">
                <span className="num">{m.n}</span>
                <span> / {m.slot}</span>
              </p>
              <h3 className="font-display text-xl uppercase leading-tight tracking-wide text-white">
                {m.h}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-white/65">
                {m.p}
              </p>
              <p className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-tube-400 underline decoration-dotted underline-offset-4 group-hover:text-tube-300">
                {m.cta} →
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* ============================================================
          QUICK PATCHES  ·  jump to live, marketplace, pricing
          ============================================================ */}
      <section className="relative z-[1] mx-auto max-w-6xl px-4 pb-16">
        <div className="studio-faceplate relative rounded-xl p-5">
          <span aria-hidden className="studio-screw absolute left-2 top-2" />
          <span aria-hidden className="studio-screw absolute right-2 top-2" />
          <span aria-hidden className="studio-screw absolute left-2 bottom-2" />
          <span aria-hidden className="studio-screw absolute right-2 bottom-2" />
          <div className="mb-4 flex items-center gap-2">
            <span aria-hidden className="led-on-green h-2 w-2 rounded-full" />
            <p className="studio-label text-white/70">Quick Patches</p>
            <span className="studio-label ml-auto text-white/35">
              Already have an account?
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Browse live sessions", href: "/studio/live" },
              { label: "Discover tracks", href: "/marketplace" },
              { label: "See pricing", href: "/pricing" },
            ].map((p) => (
              <Link
                key={p.href}
                href={p.href}
                className="inline-flex items-center gap-2 rounded-md studio-faceplate-dark px-4 py-2.5 font-display text-sm uppercase tracking-[0.18em] text-white/80 hover:text-tube-300"
              >
                {p.label} →
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
