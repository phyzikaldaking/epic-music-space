import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Studio · Pro Creator Console",
  description:
    "Open the compact Pro Tools-style EMS Studio with edit, mix, beat-machine, and publishing workflows.",
};

export default async function StudioIndexPage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect("/studio/try");
  }
  return <PublicStudioLanding />;
}

function PublicStudioLanding() {
  return (
    <main className="min-h-[calc(100vh-65px)] overflow-hidden bg-[#05060b] text-white">
      <section className="relative border-b border-cyan-300/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.22),transparent_34%),radial-gradient(circle_at_80%_10%,rgba(217,70,239,0.18),transparent_30%),linear-gradient(180deg,#070914,#05060b)]">
        <div className="mx-auto grid max-w-[1500px] gap-8 px-4 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:py-16">
          <div className="flex flex-col justify-center">
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-cyan-200/80">EMS Pro Studio · Web DAW</p>
            <h1 className="mt-4 font-display text-4xl font-black uppercase leading-[0.98] tracking-[0.04em] sm:text-6xl lg:text-7xl">
              Edit.
              <br />
              Mix.
              <br />
              Beat Machine.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/70 sm:text-lg">
              A compact Pro Tools-style creator console for recording, arranging, mixing, programming drums, and preparing releases inside Epic Music Space.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/studio/try" className="rounded-md bg-cyan-300 px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-black shadow-lg shadow-cyan-500/20">
                Open Studio →
              </Link>
              <Link href="/studio/ultra" className="rounded-md border border-fuchsia-300/35 bg-fuchsia-300/10 px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-fuchsia-100">
                View Ultra Upgrades →
              </Link>
              <Link href="/auth/signin?callbackUrl=%2Fstudio%2Ftry" className="rounded-md border border-white/15 bg-white/[0.04] px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-white/80">
                Sign In →
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/45 p-3 shadow-[0_30px_120px_-55px_rgba(34,211,238,0.65)] backdrop-blur">
            <div className="mb-3 flex items-center justify-between rounded-lg border border-white/10 bg-black/70 px-3 py-2">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.22em] text-cyan-200/70">Control Room</p>
                <p className="text-sm font-black uppercase tracking-[0.12em]">Pro Tools-Style Surface</p>
              </div>
              <div className="flex gap-1">
                {['Edit','Mix','Beat'].map((tab) => <span key={tab} className="rounded bg-cyan-300/15 px-2 py-1 text-[10px] font-black uppercase text-cyan-100">{tab}</span>)}
              </div>
            </div>
            <div className="grid grid-cols-[1fr_220px] gap-3">
              <div className="rounded-lg border border-white/10 bg-[#070914] p-2">
                <div className="grid grid-cols-12 gap-1 border-b border-white/10 pb-2 text-[8px] uppercase text-white/35">
                  {Array.from({ length: 12 }, (_, i) => <span key={i} className="text-center">{i + 1}</span>)}
                </div>
                {['Lead Vox','Adlibs','Beat','808','Keys'].map((lane, row) => (
                  <div key={lane} className="grid grid-cols-[80px_1fr] gap-2 border-b border-white/5 py-2">
                    <p className="text-[10px] font-bold text-white/60">{lane}</p>
                    <div className="grid grid-cols-12 gap-1">
                      {Array.from({ length: 12 }, (_, i) => <div key={i} className={`h-6 rounded ${((i + row) % 3 === 0) ? 'bg-gradient-to-r from-cyan-400/60 to-fuchsia-400/50' : 'bg-white/[0.04]'}`} />)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-1 rounded-lg border border-white/10 bg-[#06070d] p-2">
                {['VOX','ADL','BEAT','808','KEY','FX','HOOK','MST'].map((track, i) => (
                  <div key={track} className="rounded border border-white/10 bg-black/60 p-1 text-center">
                    <p className="text-[8px] font-black text-white/60">{track}</p>
                    <div className="mt-1 space-y-1">
                      {['EQ','CP','FX'].map((fx) => <div key={fx} className="rounded bg-cyan-300/10 py-0.5 text-[7px] text-cyan-100">{fx}</div>)}
                    </div>
                    <div className="mx-auto mt-2 h-16 w-2 rounded bg-white/10"><div className="mt-auto h-10 rounded bg-emerald-300" /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1500px] gap-3 px-4 py-10 md:grid-cols-3">
        {[
          ['Compact Mixer', 'Plugin-sized EQ, compression, tune, send, mute, solo, and fader controls on each track.'],
          ['Edit Timeline', 'Track lanes, bar grid, arrangement clips, vocal sections, markers, and import-ready audio flow.'],
          ['MPC Beat Machine', '16-step drum sequencing for kick, snare, hats, 808s, percussion, and pattern generation.'],
        ].map(([title, body]) => (
          <Link key={title} href="/studio/try" className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 transition hover:border-cyan-300/35 hover:bg-cyan-300/10">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200/70">Live Module</p>
            <h2 className="mt-2 text-xl font-black uppercase tracking-[0.08em]">{title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/65">{body}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
