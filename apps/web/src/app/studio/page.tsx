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
  });

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gradient-to-b from-[#070710] via-[#0b0b18] to-[#040408]">
      <StudioHubClient studioUsername={studio?.username ?? null} />
    </div>
  );
}

function PublicStudioLanding() {
  return (
    <div className="min-h-[calc(100vh-65px)] bg-gradient-to-b from-[#070710] via-[#0b0b18] to-[#040408]">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-brand-500/10 via-accent-500/5 to-transparent p-6 sm:p-10">
          <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand-500/20 blur-[120px]" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-accent-500/15 blur-[120px]" />

          <div className="relative">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-300/85">
              EMS Studio
            </p>
            <h1 className="mt-2 text-3xl font-extrabold sm:text-5xl">
              <span className="text-gradient-ems">A studio in your browser.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-base text-white/65 sm:text-lg">
              Make beats with a 7-kit drum machine, layer multitrack with EQ and
              compression, and publish straight to the marketplace — all without
              installing a thing.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/auth/signup?role=ARTIST&callbackUrl=%2Fstudio%2Fboard"
                className="rounded-xl bg-brand-500 px-6 py-3 text-sm font-bold text-white transition hover:bg-brand-600"
              >
                Start making beats →
              </Link>
              <Link
                href="/auth/signin?callbackUrl=%2Fstudio"
                className="rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-white/75 transition hover:bg-white/8"
              >
                Sign in
              </Link>
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
              href: "/studio/board",
            },
            {
              icon: "🎙️",
              title: "Multitrack + Mixer",
              body: "Per-track EQ, compression, reverb, delay, sidechain. Master chain with limiter + LUFS.",
              cta: "Open the mixer",
              href: "/studio/board",
            },
            {
              icon: "⚡",
              title: "90-second publish",
              body: "Audio → name → price. Three taps to ship a track to the EMS marketplace with licensing built in.",
              cta: "Try Quick Upload",
              href: "/studio/new",
            },
          ].map((f) => (
            <Link
              key={f.title}
              href={f.href}
              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-brand-500/30 hover:bg-white/[0.05]"
            >
              <div className="text-3xl">{f.icon}</div>
              <p className="mt-3 text-base font-semibold text-white">{f.title}</p>
              <p className="mt-2 text-sm text-white/55">{f.body}</p>
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
          <div className="mt-3 flex flex-wrap gap-3">
            <Link
              href="/studio/live"
              className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
            >
              🎙️ Browse live sessions
            </Link>
            <Link
              href="/marketplace"
              className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
            >
              🎵 Discover tracks
            </Link>
            <Link
              href="/pricing"
              className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
            >
              💎 See pricing
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
