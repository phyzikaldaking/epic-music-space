import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const share = await prisma.guestShare.findUnique({
    where: { token },
    select: { token: true, expiresAt: true },
  });
  if (!share) return { title: "Beat not found" };
  return {
    title: "Listen to this beat — made on Epic Music Space",
    description: "Someone made a beat in the EMS Studio and shared it. Listen, then make your own.",
    openGraph: {
      title: "🎧 New beat made on Epic Music Space",
      description: "Tap to hear it. Then make your own — no signup needed.",
    },
    robots: { index: false }, // public link, but not indexed
  };
}

export default async function SharePage({ params }: Props) {
  const { token } = await params;
  const share = await prisma.guestShare.findUnique({
    where: { token },
    select: {
      token: true,
      audioUrl: true,
      durationSec: true,
      createdAt: true,
      expiresAt: true,
      listenCount: true,
    },
  });
  if (!share) notFound();
  if (share.expiresAt < new Date()) notFound();

  // Bump listen count (best-effort, no await on the response so the
  // request stays fast). Using updateMany so a race between two SSR
  // hits doesn't crash on the same-row write.
  void prisma.guestShare.updateMany({
    where: { token },
    data: { listenCount: { increment: 1 } },
  }).catch(() => undefined);

  const minutes = share.durationSec ? Math.floor(share.durationSec / 60) : 0;
  const seconds = share.durationSec ? share.durationSec % 60 : 0;
  const durationLabel = share.durationSec
    ? `${minutes}:${seconds.toString().padStart(2, "0")}`
    : null;

  const expiresIn = Math.max(0, Math.ceil((share.expiresAt.getTime() - Date.now()) / (24 * 3600 * 1000)));

  return (
    <div className="relative mx-auto min-h-[calc(100vh-65px)] max-w-xl px-4 py-12">
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 h-[600px] w-[900px] rounded-full bg-gradient-to-br from-amber-400/10 via-fuchsia-500/10 to-cyan-400/10 blur-[140px]" />

      <div className="relative">
        <div className="text-center">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.3em] text-cyan-200">
            🎧 Made on EMS Studio
          </p>
          <h1 className="text-3xl font-extrabold sm:text-4xl">
            Someone made a beat.
            <br />
            <span className="bg-gradient-to-r from-amber-300 via-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">
              Tap play to hear it.
            </span>
          </h1>
        </div>

        <div className="mt-8 overflow-hidden rounded-3xl border border-white/12 bg-gradient-to-br from-white/5 to-white/0 p-5">
          <audio
            src={share.audioUrl}
            controls
            preload="metadata"
            className="w-full"
          />
          <div className="mt-3 flex items-center justify-between text-[11px] text-white/45">
            {durationLabel && <span>{durationLabel} · WAV</span>}
            <span>👂 {share.listenCount.toLocaleString()} listen{share.listenCount === 1 ? "" : "s"}</span>
            <span>{expiresIn > 0 ? `Expires in ${expiresIn}d` : "Expires soon"}</span>
          </div>
        </div>

        {/* The viral loop CTA */}
        <div className="relative mt-10">
          <p className="mb-3 text-center text-sm text-white/65">
            Like it? Make your own — no account, no install, no plugins.
          </p>
          <Link
            href="/studio/try?ref=share"
            className="block w-full rounded-2xl bg-gradient-to-r from-amber-400 via-fuchsia-500 to-cyan-400 py-4 text-center text-base font-extrabold text-black shadow-2xl shadow-fuchsia-500/30 transition hover:opacity-95"
          >
            🎚️ Open the EMS Studio →
          </Link>
          <p className="mt-3 text-center text-[11px] text-white/35">
            No signup needed to start. Save your beat with one email when you have something worth keeping.
          </p>
        </div>

        {/* Trust strip */}
        <div className="mt-10 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-white/10 bg-white/3 p-3 text-center">
            <p className="text-xl font-extrabold text-white">100%</p>
            <p className="mt-1 text-[10px] uppercase tracking-widest text-white/45">Yours to keep</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/3 p-3 text-center">
            <p className="text-xl font-extrabold text-white">$0</p>
            <p className="mt-1 text-[10px] uppercase tracking-widest text-white/45">Monthly fees</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/3 p-3 text-center">
            <p className="text-xl font-extrabold text-white">90s</p>
            <p className="mt-1 text-[10px] uppercase tracking-widest text-white/45">First publish</p>
          </div>
        </div>
      </div>
    </div>
  );
}
