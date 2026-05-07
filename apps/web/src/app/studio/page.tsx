import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import StudioHubClient from "./StudioHubClient";

export const metadata: Metadata = {
  title: "Studio · Make beats, mix, publish",
  description:
    "Open the in-browser DAW, upload a track in 90 seconds, or jump into a live session. Free to start.",
};

export default async function StudioIndexPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return <PublicStudioLanding />;
  }

  const studio = await prisma.studio.findFirst({
    where: { userId: session.user.id },
    select: { username: true },
  }).catch(() => null);

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gradient-to-b from-[#070710] via-[#0b0b18] to-[#040408]">
      <StudioHubClient studioUsername={studio?.username ?? null} />
    </div>
  );
}

function PublicStudioLanding() {
  return (
    <div className="min-h-[calc(100vh-65px)] bg-gradient-to-b from-[#070710] via-[#0b0b18] to-[#040408]">
      <div className="mx-auto max-w-6xl px-4 py-10 pb-[calc(env(safe-area-inset-bottom)+3rem)] sm:py-16">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-brand-500/10 via-accent-500/5 to-transparent p-6 sm:p-12">
          <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand-500/20 blur-[120px]" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-accent-500/15 blur-[120px]" />

          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-brand-300/85">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-400" />
              </span>
              EMS Studio · Live in your browser
            </div>
            <h1 className="mt-4 text-4xl font-extrabold leading-[1.05] sm:text-6xl">
              <span className="text-gradient-ems">Make a track.</span>
              <br className="hidden sm:block" />
              <span className="text-white"> Sell it. Keep 100%.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base text-white/70 sm:text-lg">
              Beat machine, multitrack, mixer, and master chain — all in your
              browser. Publish straight to the EMS marketplace with licensing
              built in. No installs, no plugins, no gatekeepers.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/studio/try"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-accent-500 px-6 py-4 text-base font-bold text-white shadow-lg shadow-brand-500/25 transition hover:opacity-95 hover:shadow-brand-500/40 active:scale-[0.99]"
              >
                Try it now — no signup →
              </Link>
              <Link
                href="/auth/signin?callbackUrl=%2Fstudio"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-4 text-base font-semibold text-white/85 transition hover:bg-white/10 active:scale-[0.99]"
              >
                Sign in
              </Link>
            </div>

            {/* Trust strip */}
            <div className="mt-8 grid max-w-lg grid-cols-3 gap-2 sm:gap-4">
              {[
                { value: "100%", label: "of license sales to artist" },
                { value: "$0", label: "monthly fees" },
                { value: "90s", label: "first publish" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center"
                >
                  <p className="text-2xl font-extrabold text-white sm:text-3xl">
                    {s.value}
                  </p>
                  <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-white/45 sm:text-xs">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: "🥁",
              title: "Beat Machine",
              body: "8 lanes, 7 kits (Trap, Drill, Afro, Hyperpop, Boom Bap, Lo-fi, Acoustic). Bake patterns into stems.",
              cta: "Open the board",
              href: "/studio/try?force-desktop=1",
            },
            {
              icon: "🎙️",
              title: "Multitrack + Mixer",
              body: "Per-track EQ, compression, reverb, delay, sidechain. Master chain with limiter + LUFS.",
              cta: "Open the mixer",
              href: "/studio/try?force-desktop=1",
            },
            {
              icon: "⚡",
              title: "90-second publish",
              body: "Audio → name → price. Three taps to ship a track to the EMS marketplace with licensing built in.",
              cta: "Try Quick Upload",
              href: "/studio/try",
            },
          ].map((f) => (
            <Link
              key={f.title}
              href={f.href}
              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-brand-500/40 hover:bg-white/[0.06] active:scale-[0.99]"
            >
              <div className="text-3xl">{f.icon}</div>
              <p className="mt-3 text-lg font-bold text-white">{f.title}</p>
              <p className="mt-2 text-sm text-white/60">{f.body}</p>
              <p className="mt-4 text-xs font-bold uppercase tracking-wider text-brand-300 group-hover:text-brand-200">
                {f.cta} →
              </p>
            </Link>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-white/45">
            Already have an account?
          </p>
          <div className="mt-3 flex flex-wrap gap-2 sm:gap-3">
            <Link
              href="/studio/live"
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/85 transition hover:bg-white/10 active:scale-[0.99]"
            >
              🎙️ Browse live sessions
            </Link>
            <Link
              href="/marketplace"
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/85 transition hover:bg-white/10 active:scale-[0.99]"
            >
              🎵 Discover tracks
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/85 transition hover:bg-white/10 active:scale-[0.99]"
            >
              💎 See pricing
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
