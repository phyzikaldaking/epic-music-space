import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Try the Studio — no signup",
  description:
    "Make a beat, record a take, and mix in the compact EMS Pro Studio interface.",
};

const tracks = ["Lead Vox", "Adlibs", "Beat", "808", "Keys", "FX", "Hook", "Master"];
const steps = Array.from({ length: 16 }, (_, index) => index + 1);
const lanes = ["Kick", "Snare", "Hat", "808", "Perc", "Clap"];

export default function StudioTryPage() {
  return (
    <main className="min-h-[calc(100vh-65px)] overflow-hidden bg-[#05060b] text-white" data-studio-content="true">
      <section className="border-b border-white/10 bg-black/80 px-3 py-2 shadow-2xl shadow-black/50 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-2">
          <div className="mr-3">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-200/80">EMS Pro Studio</p>
            <h1 className="font-display text-xl uppercase tracking-[0.12em] text-white">Pro Tools-Style Compact DAW</h1>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.04] p-1">
            {["⏮", "⏪", "▶", "⏹", "⏺"].map((item) => (
              <button key={item} type="button" className="grid h-9 w-9 place-items-center rounded-full bg-black/60 text-sm text-white/85 hover:bg-cyan-400/20">{item}</button>
            ))}
          </div>
          <div className="rounded-md border border-white/10 bg-black/55 px-3 py-2 font-mono text-sm text-emerald-200">00:00:00</div>
          <div className="rounded-md border border-white/10 bg-black/55 px-3 py-2 text-xs font-black uppercase tracking-widest text-white/70">BPM 90</div>
          <nav className="ml-auto flex overflow-x-auto rounded-md border border-cyan-300/20 bg-cyan-300/5 p-1 text-[11px] font-black uppercase tracking-widest">
            {["Edit", "Mix", "Beat", "Publish"].map((tab) => (
              <a key={tab} href={`#${tab.toLowerCase()}`} className="rounded px-4 py-2 text-cyan-100 hover:bg-cyan-300/20">{tab}</a>
            ))}
          </nav>
        </div>
      </section>

      <section id="edit" className="mx-auto grid max-w-[1500px] gap-3 px-3 py-3 lg:grid-cols-[220px_1fr_300px]">
        <aside className="rounded-xl border border-white/10 bg-[#080a12] p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/40">Track List</p>
          <div className="mt-3 space-y-2">
            {tracks.map((track, index) => (
              <div key={track} className="flex items-center justify-between rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs">
                <span className="font-bold text-white/80">{index + 1}. {track}</span>
                <span className="h-2 w-2 rounded-full bg-emerald-300" />
              </div>
            ))}
          </div>
        </aside>

        <div className="rounded-xl border border-white/10 bg-[#090b14] p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200/70">Edit Window</p>
              <h2 className="text-lg font-black uppercase tracking-[0.08em]">Pro Tools-Style Timeline</h2>
            </div>
            <button type="button" className="rounded-md bg-cyan-300 px-3 py-2 text-xs font-black uppercase tracking-widest text-black">+ Add Audio</button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/40">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-[120px_repeat(16,minmax(44px,1fr))] border-b border-white/10 text-[10px] uppercase tracking-widest text-white/45">
                <div className="border-r border-white/10 p-2">Bars</div>
                {steps.map((step) => <div key={step} className="border-r border-white/5 p-2 text-center">{step}</div>)}
              </div>
              {tracks.slice(0, 6).map((track, row) => (
                <div key={track} className="grid grid-cols-[120px_repeat(16,minmax(44px,1fr))] border-b border-white/6">
                  <div className="border-r border-white/10 bg-white/[0.03] p-2 text-xs font-bold text-white/70">{track}</div>
                  {steps.map((step) => (
                    <div key={step} className="h-12 border-r border-white/5 p-1">
                      {(step + row) % 3 === 0 && <div className="h-full rounded bg-gradient-to-r from-cyan-400/50 to-fuchsia-400/40" />}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="rounded-xl border border-white/10 bg-[#080a12] p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-fuchsia-200/70">Plugin Rack</p>
          {["AutoTune", "EQ3", "Compressor", "De-Esser", "Limiter"].map((plugin) => (
            <div key={plugin} className="mt-3 rounded-lg border border-white/10 bg-black/40 p-3">
              <div className="flex items-center justify-between text-xs font-black uppercase tracking-widest">
                <span>{plugin}</span><span className="text-emerald-300">ON</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[1, 2, 3].map((knob) => <button key={knob} type="button" className="mx-auto h-10 w-10 rounded-full border-4 border-cyan-300/60 bg-black shadow-inner" />)}
              </div>
            </div>
          ))}
        </aside>
      </section>

      <section id="mix" className="mx-auto max-w-[1500px] px-3 pb-3">
        <div className="rounded-xl border border-white/10 bg-[#070910] p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-black uppercase tracking-[0.08em]">Compact Pro Mixer — Plugin Modules On Tracks</h2>
            <p className="text-xs text-white/50">Small modules. No oversized equipment blocks.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
            {tracks.map((track, index) => (
              <article key={track} className="rounded-lg border border-white/10 bg-black/50 p-2">
                <div className="mb-2 rounded bg-white/[0.04] px-2 py-1 text-center text-[11px] font-black uppercase tracking-widest text-white/75">{track}</div>
                <div className="grid grid-cols-2 gap-1 text-[9px] font-bold uppercase tracking-wider">
                  {["EQ", "Comp", "Tune", "Send"].map((fx) => <button key={fx} className="rounded border border-cyan-300/20 bg-cyan-300/8 px-1 py-2 text-cyan-100">{fx}</button>)}
                </div>
                <div className="mt-3 flex h-36 items-end justify-center gap-2 rounded bg-white/[0.03] p-2">
                  <div className="flex h-full w-3 items-end rounded bg-white/10"><div className="h-2/3 w-full rounded bg-emerald-400" /></div>
                  <input aria-label={`${track} fader`} type="range" min="0" max="100" defaultValue={70 - index * 4} className="h-28 w-5 rotate-[-90deg] accent-cyan-300" />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1 text-[9px] font-black">
                  <button className="rounded bg-red-500/20 py-2 text-red-200">REC</button>
                  <button className="rounded bg-yellow-500/20 py-2 text-yellow-100">SOLO</button>
                  <button className="rounded bg-white/10 py-2 text-white/65">MUTE</button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="beat" className="mx-auto max-w-[1500px] px-3 pb-6">
        <div className="rounded-xl border border-white/10 bg-[#090b14] p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-black uppercase tracking-[0.08em]">Beat Machine — MPC / Step Sequencer</h2>
              <p className="text-xs text-white/50">Tap-ready pads and mobile horizontal scroll for compact sessions.</p>
            </div>
            <button type="button" className="rounded-md bg-fuchsia-400 px-3 py-2 text-xs font-black uppercase tracking-widest text-black">Generate Pattern</button>
          </div>
          <div className="grid gap-2 overflow-x-auto pb-2">
            {lanes.map((lane, row) => (
              <div key={lane} className="grid min-w-[760px] grid-cols-[90px_repeat(16,minmax(36px,1fr))] gap-1">
                <button type="button" className="rounded bg-white/[0.05] px-2 py-2 text-xs font-black uppercase tracking-widest text-white/70">{lane}</button>
                {steps.map((step) => {
                  const active = (step + row) % (row === 2 ? 2 : 4) === 0;
                  return <button key={step} type="button" className={`h-11 rounded border text-xs font-black ${active ? "border-fuchsia-300 bg-fuchsia-400 text-black" : "border-white/10 bg-black/50 text-white/30"}`}>{step}</button>;
                })}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
