import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Studio",
  description:
    "Enter the electrified EMS creator universe: studio, mixer, beat machine, piano roll, samples, and artist tools.",
};

export default function StudioIndexPage() {
  return <PublicStudioLanding />;
}

function PublicStudioLanding() {
  return (
    <main className="min-h-[calc(100vh-65px)] overflow-hidden bg-[#12051f] text-white">
      <section className="relative border-b border-white/15 bg-[radial-gradient(circle_at_10%_10%,rgba(250,204,21,0.34),transparent_24%),radial-gradient(circle_at_78%_0%,rgba(236,72,153,0.42),transparent_30%),radial-gradient(circle_at_55%_55%,rgba(34,211,238,0.28),transparent_30%),linear-gradient(135deg,#22072f,#090b2e_48%,#061d2a)]">
        <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.12)_1px,transparent_1px)] [background-size:42px_42px]" />
        <div className="absolute -left-20 top-20 h-64 w-64 rounded-full bg-yellow-300/25 blur-3xl" />
        <div className="absolute -right-16 bottom-16 h-80 w-80 rounded-full bg-fuchsia-500/25 blur-3xl" />
        <div className="relative mx-auto grid max-w-[1500px] gap-8 px-4 py-12 lg:grid-cols-[1fr_1fr] lg:py-16">
          <div className="flex flex-col justify-center">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.24em] text-yellow-100 shadow-lg shadow-fuchsia-500/15 backdrop-blur">
              <span className="text-lg">🎹</span> EMS Creative Studio <span className="text-lg">🎸</span>
            </div>
            <h1 className="mt-5 font-display text-5xl font-black uppercase leading-[0.9] tracking-[0.02em] sm:text-7xl lg:text-8xl">
              Make It{" "}
              <span className="block bg-gradient-to-r from-yellow-200 via-fuchsia-300 to-cyan-200 bg-clip-text text-transparent drop-shadow-[0_0_24px_rgba(236,72,153,.45)]">Sound Alive.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/82 sm:text-xl">
              A neon music playground for artists: real sample pads, Pro Tools-style editing, compact mixer strips, piano-roll ideas, cinematic textures, and release-ready creator tools.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/studio/try" className="rounded-2xl bg-gradient-to-r from-yellow-300 via-fuchsia-400 to-cyan-300 px-7 py-4 text-sm font-black uppercase tracking-[0.18em] text-black shadow-[0_0_45px_rgba(236,72,153,.35)] transition hover:scale-[1.02]">
                Enter The Studio →
              </Link>
              <Link href="/studio/ultra" className="rounded-2xl border border-white/25 bg-white/12 px-7 py-4 text-sm font-black uppercase tracking-[0.18em] text-white shadow-lg backdrop-blur transition hover:bg-white/20">
                See Ultra Features →
              </Link>
              <Link href="/auth/signin?callbackUrl=%2Fstudio%2Ftry" className="rounded-2xl border border-cyan-200/35 bg-cyan-300/10 px-7 py-4 text-sm font-black uppercase tracking-[0.18em] text-cyan-50 transition hover:bg-cyan-300/18">
                Sign In →
              </Link>
            </div>
          </div>

          <div className="relative rounded-[2rem] border border-white/20 bg-white/10 p-4 shadow-[0_30px_140px_-40px_rgba(250,204,21,.55)] backdrop-blur-xl">
            <div className="absolute -left-8 -top-8 rotate-[-10deg] rounded-3xl border border-yellow-200/50 bg-yellow-300 px-5 py-3 text-4xl shadow-2xl">🎤</div>
            <div className="absolute -right-8 top-8 rotate-[10deg] rounded-3xl border border-fuchsia-200/50 bg-fuchsia-400 px-5 py-3 text-4xl shadow-2xl">🎸</div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/15 bg-black/35 px-4 py-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-yellow-200">Control Room</p>
                <p className="text-lg font-black uppercase tracking-[0.12em]">Artist Cockpit</p>
              </div>
              <div className="flex gap-1">
                {['Edit','Mix','Beat'].map((tab) => <span key={tab} className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-black uppercase text-white">{tab}</span>)}
              </div>
            </div>
            <div className="grid gap-3 xl:grid-cols-[1fr_230px]">
              <div className="rounded-3xl border border-white/15 bg-black/45 p-3">
                <div className="mb-3 grid grid-cols-14 gap-1 overflow-hidden rounded-xl bg-white p-1">
                  {Array.from({ length: 14 }, (_, i) => <div key={i} className={`${i % 2 ? 'h-12 bg-black' : 'h-16 bg-white'} rounded-b-md border border-black/20`} />)}
                </div>
                {['Lead Vox','Adlibs','Beat','808','Keys'].map((lane, row) => (
                  <div key={lane} className="grid grid-cols-[86px_1fr] gap-2 border-b border-white/8 py-2">
                    <p className="text-[10px] font-black uppercase text-white/75">{lane}</p>
                    <div className="grid grid-cols-12 gap-1">
                      {Array.from({ length: 12 }, (_, i) => <div key={i} className={`h-7 rounded-full ${((i + row) % 3 === 0) ? 'bg-gradient-to-r from-yellow-300 via-fuchsia-400 to-cyan-300 shadow-[0_0_14px_rgba(34,211,238,.45)]' : 'bg-white/10'}`} />)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-3xl border border-white/15 bg-black/40 p-2">
                {['VOX','ADL','BEAT','808','KEY','FX','HOOK','MST'].map((track, i) => (
                  <div key={track} className="rounded-2xl border border-white/15 bg-gradient-to-b from-white/12 to-black/30 p-2 text-center">
                    <p className="text-[9px] font-black text-white/75">{track}</p>
                    <div className="mt-2 space-y-1">
                      {['EQ','CP','FX'].map((fx) => <div key={fx} className="rounded-full bg-cyan-300/20 py-1 text-[7px] font-black text-cyan-100">{fx}</div>)}
                    </div>
                    <div className="mx-auto mt-2 flex h-14 w-3 items-end rounded-full bg-white/15"><div className="w-full rounded-full bg-gradient-to-t from-emerald-300 to-yellow-200" style={{ height: `${50 + (i % 4) * 10}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1500px] gap-4 px-4 py-10 md:grid-cols-3">
        {[
          ['🎛️', 'Mixer That Moves', 'Plugin-sized EQ, compression, tune, sends, mute/solo, and real sample routing without boring gray boxes.'],
          ['📺', 'Studio TV Timeline', 'Track lanes, vocal clips, markers, waveform canvas, and cinematic preview zones that feel like a creative dashboard.'],
          ['🥁', 'MPC Beat Machine', 'Kick, snare, clap, hats, 808s, and choir textures loaded from your real Supabase sound kits.'],
        ].map(([icon, title, body]) => (
          <Link key={title} href="/studio/try" className="group rounded-[2rem] border border-white/15 bg-gradient-to-br from-white/14 to-white/[0.035] p-6 shadow-xl shadow-black/20 transition hover:-translate-y-1 hover:border-yellow-200/50 hover:shadow-[0_0_55px_rgba(250,204,21,.22)]">
            <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-yellow-300 via-fuchsia-400 to-cyan-300 text-3xl shadow-lg shadow-fuchsia-500/20 group-hover:rotate-6">{icon}</div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-yellow-200/85">Live Module</p>
            <h2 className="mt-2 text-2xl font-black uppercase tracking-[0.06em]">{title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/72">{body}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
