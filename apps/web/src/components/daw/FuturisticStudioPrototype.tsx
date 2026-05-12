"use client";

const tracks = [
  { name: "Drums", color: "cyan", value: "-4.3" },
  { name: "Bass", color: "violet", value: "-6.1" },
  { name: "Synth Lead", color: "pink", value: "-3.7" },
  { name: "Lead Main", color: "amber", value: "-2.6" },
  { name: "Vocal Chop", color: "purple", value: "-1.8" },
  { name: "Guitar", color: "emerald", value: "-0.6" },
  { name: "FX", color: "blue", value: "-2.3" },
  { name: "Pad", color: "fuchsia", value: "-0.3" },
];

const scenes = ["Radio Mix", "Club Mix", "Clean", "Performance", "Battle", "Streaming"];
const sections = ["INTRO", "VERSE", "CHORUS", "DROP", "BRIDGE", "OUTRO"];
const colors: Record<string, string> = {
  cyan: "from-cyan-400 to-blue-500 border-cyan-300/40 text-cyan-200",
  violet: "from-violet-500 to-purple-500 border-violet-300/40 text-violet-200",
  pink: "from-fuchsia-500 to-pink-500 border-fuchsia-300/40 text-fuchsia-200",
  amber: "from-amber-300 to-yellow-500 border-amber-300/50 text-amber-200",
  purple: "from-purple-500 to-indigo-500 border-purple-300/40 text-purple-200",
  emerald: "from-emerald-400 to-teal-500 border-emerald-300/40 text-emerald-200",
  blue: "from-sky-400 to-blue-600 border-sky-300/40 text-sky-200",
  fuchsia: "from-fuchsia-400 to-violet-600 border-fuchsia-300/40 text-fuchsia-200",
};

function WaveLane({ color, index }: { color: string; index: number }) {
  const heights = Array.from({ length: 68 }, (_, i) => 20 + ((i * 13 + index * 17) % 58));
  return (
    <div className="relative h-16 overflow-hidden rounded-xl border border-white/10 bg-black/35">
      <div className={`absolute inset-0 bg-gradient-to-r ${colors[color].split(" border")[0]} opacity-10`} />
      <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center gap-[3px] px-3">
        {heights.map((height, i) => (
          <span key={i} className={`w-[3px] rounded-full bg-gradient-to-t ${colors[color].split(" border")[0]} opacity-90`} style={{ height }} />
        ))}
      </div>
    </div>
  );
}

function MixerStrip({ track, index }: { track: { name: string; color: string; value: string }; index: number }) {
  const meter = 42 + ((index * 11) % 45);
  return (
    <div className={`min-w-[92px] rounded-2xl border bg-slate-950/80 p-3 ${colors[track.color].split(" ").slice(2).join(" ")}`}>
      <p className={`truncate text-center text-[10px] font-black uppercase tracking-[0.18em] ${colors[track.color].split(" ").slice(-1)[0]}`}>{track.name}</p>
      <div className="mt-3 space-y-1 text-[9px] text-white/50">
        <div className="rounded bg-white/5 px-2 py-1">EQ</div>
        <div className="rounded bg-white/5 px-2 py-1">Comp</div>
        <div className="rounded bg-white/5 px-2 py-1">Bus</div>
      </div>
      <div className="mx-auto mt-4 h-9 w-9 rounded-full border border-cyan-200/30 bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,.35),rgba(6,182,212,.16),rgba(0,0,0,.8))]" />
      <div className="mt-3 flex justify-center gap-1 text-[10px] font-black">
        <span className="rounded border border-white/15 px-1.5 py-1 text-white/70">M</span>
        <span className="rounded border border-cyan-300/30 px-1.5 py-1 text-cyan-200">S</span>
      </div>
      <div className="mt-3 flex h-36 items-end gap-2">
        <div className="h-full w-3 rounded-full bg-white/10 p-[2px]">
          <div className="w-full rounded-full bg-gradient-to-t from-cyan-400 via-emerald-300 to-amber-300" style={{ height: `${meter}%` }} />
        </div>
        <div className="relative h-full flex-1 rounded bg-white/5">
          <div className="absolute left-1/2 top-[42%] h-7 w-4 -translate-x-1/2 rounded bg-white shadow-lg shadow-cyan-400/20" />
        </div>
      </div>
      <p className="mt-2 rounded-lg bg-black/50 py-1 text-center text-xs font-black text-white">{track.value}</p>
    </div>
  );
}

export default function FuturisticStudioPrototype() {
  return (
    <main className="min-h-screen bg-[#030712] p-2 text-white md:p-5">
      <div className="mx-auto max-w-[1800px] rounded-[2rem] border border-cyan-300/20 bg-[#07101d] p-3 shadow-2xl shadow-cyan-950/40">
        <header className="flex flex-col gap-3 border-b border-white/10 pb-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-cyan-400 text-2xl font-black">E</div>
            <div>
              <h1 className="text-2xl font-black uppercase tracking-[0.14em]">Epic Music Space</h1>
              <p className="text-[10px] uppercase tracking-[0.28em] text-white/45">Next generation production suite</p>
            </div>
          </div>
          <nav className="grid flex-1 grid-cols-4 overflow-hidden rounded-xl border border-white/10 bg-black/30 lg:max-w-xl">
            {['EDIT', 'MIX', 'MASTER', 'PUBLISH'].map((item, index) => (
              <button key={item} className={`px-5 py-3 text-xs font-black tracking-[0.2em] ${index === 0 ? 'bg-cyan-400/20 text-cyan-100 ring-1 ring-cyan-300/50' : 'text-white/60'}`}>{item}</button>
            ))}
          </nav>
          <div className="flex items-center gap-4 text-xs text-white/60">
            <span>48 kHz</span><span>24 Bit</span><span>120 TC</span><span className="rounded-full border border-white/15 px-3 py-2">Epic User</span>
          </div>
        </header>

        <section className="mt-3 grid gap-3 lg:grid-cols-[220px_minmax(520px,1fr)_620px_300px]">
          <aside className="rounded-2xl border border-white/10 bg-black/30 p-3">
            <div className="flex items-center justify-between"><p className="text-xs font-black uppercase tracking-[0.2em] text-white/70">Arrangement</p><span className="text-cyan-300">+</span></div>
            <button className="mt-3 rounded-lg border border-cyan-300/40 bg-cyan-400/10 px-3 py-2 text-xs font-black text-cyan-200">TRACKS</button>
            <div className="mt-3 space-y-2">
              {tracks.map((track, index) => (
                <div key={track.name} className="rounded-xl border border-white/10 bg-slate-950/60 p-2">
                  <div className="flex items-center gap-2"><span className="text-xs text-white/40">{index + 1}</span><span className={`h-2 w-2 rounded-full bg-gradient-to-r ${colors[track.color].split(" border")[0]}`} /><span className="text-sm font-bold">{track.name}</span></div>
                  <div className="mt-2 flex gap-1 text-[10px] font-black"><span className="rounded bg-white/10 px-2 py-1">M</span><span className="rounded bg-white/10 px-2 py-1">S</span><span className="rounded bg-red-500/40 px-2 py-1">R</span></div>
                </div>
              ))}
            </div>
            <button className="mt-3 w-full rounded-xl border border-white/10 py-3 text-xs font-black text-white/60">+ ADD TRACK</button>
          </aside>

          <section className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2"><p className="text-xs font-black uppercase tracking-[0.2em] text-white/60">Timeline</p><div className="flex gap-2 text-[10px] text-white/50"><span>Snap</span><span>Smart</span></div></div>
            <div className="mt-2 grid grid-cols-6 gap-1 text-center text-[10px] font-black tracking-[0.16em]">
              {sections.map((section) => <span key={section} className="rounded bg-cyan-400/10 py-1 text-cyan-200">{section}</span>)}
            </div>
            <div className="relative mt-3 space-y-2">
              <div className="absolute left-[24%] top-0 z-10 h-full w-px bg-white/70 shadow-[0_0_18px_rgba(34,211,238,.8)]" />
              {tracks.slice(0, 6).map((track, index) => <WaveLane key={track.name} color={track.color} index={index} />)}
              <div className="space-y-2 pt-1">
                {['Filter Freq · Master', 'Reverb · Mix', 'Volume · Master'].map((label, index) => (
                  <div key={label} className="relative h-10 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-[10px] text-cyan-200">
                    {label}
                    <div className={`absolute bottom-2 left-36 right-4 h-px bg-gradient-to-r ${index === 1 ? 'from-fuchsia-400 to-pink-400' : index === 2 ? 'from-cyan-400 to-blue-400' : 'from-amber-300 to-yellow-400'}`} />
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-cyan-300/20 bg-black/35 p-3">
            <div className="mb-3 flex items-center justify-between"><p className="text-xs font-black uppercase tracking-[0.2em] text-white/70">Pro Mix Window</p><span className="text-white/40">⚙ ×</span></div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {tracks.map((track, index) => <MixerStrip key={track.name} track={track} index={index} />)}
              <div className="min-w-[90px] rounded-2xl border border-amber-300/50 bg-amber-300/10 p-3"><p className="text-center text-[10px] font-black text-amber-200">MASTER</p><div className="mt-8 h-56 rounded-full bg-gradient-to-t from-cyan-400 via-emerald-300 to-amber-300" /><p className="mt-3 text-center text-xs font-black">-0.3</p></div>
            </div>
          </section>

          <aside className="rounded-2xl border border-cyan-300/20 bg-slate-950/80 p-4">
            <div className="flex justify-between"><div><p className="text-xs font-black uppercase tracking-[0.22em]">Mix Doctor</p><p className="text-[10px] uppercase text-white/40">AI Assistant</p></div><span>×</span></div>
            <div className="mx-auto mt-9 grid h-24 w-24 place-items-center rounded-full border border-cyan-300/40 bg-cyan-400/10 text-cyan-200 shadow-[0_0_35px_rgba(34,211,238,.35)]">〽</div>
            <p className="mt-6 text-center text-sm text-white/70">Analyzing your mix...</p>
            <div className="mt-6 space-y-5 text-xs">
              {['Overall Balance     Good', 'Tonality     Slightly Bright', 'Dynamics     Good', 'Stereo Width     Wide'].map((label, index) => (
                <div key={label}><div className="mb-2 flex justify-between"><span>{label.split('     ')[0]}</span><span className="text-emerald-300">{label.split('     ')[1]}</span></div><div className="h-1 rounded-full bg-gradient-to-r from-cyan-400 via-amber-300 to-emerald-400" /></div>
              ))}
            </div>
            <div className="mt-8 space-y-3"><p className="text-xs font-black uppercase tracking-[0.2em] text-white/60">Suggestions</p>{['Vocal is slightly bright', 'Low end is a bit heavy', 'Kick needs more punch'].map((tip) => <div key={tip} className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs"><div className="flex justify-between"><span>{tip}</span><button className="text-cyan-300">APPLY</button></div></div>)}<button className="w-full rounded-xl border border-cyan-300/40 bg-cyan-400/10 py-3 text-xs font-black text-cyan-200">AUTO BALANCE MIX</button></div>
          </aside>
        </section>

        <section className="mt-3 grid gap-3 lg:grid-cols-[280px_1fr_160px_160px_180px_320px]">
          <div className="rounded-2xl border border-white/10 bg-black/30 p-3"><p className="text-xs font-black uppercase tracking-[0.2em]">Scenes</p><div className="mt-3 space-y-2">{scenes.map((scene) => <div key={scene} className={`rounded-lg border px-3 py-2 text-sm ${scene === 'Club Mix' ? 'border-cyan-300/50 bg-cyan-400/10 text-cyan-100' : 'border-white/10 text-white/60'}`}>○ {scene}</div>)}</div></div>
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4"><p className="text-xs font-black uppercase tracking-[0.2em]">Mastering</p><div className="mt-4 h-16 rounded-xl bg-gradient-to-r from-purple-500/20 via-cyan-400/20 to-purple-500/20" /><div className="mt-6 grid grid-cols-4 gap-4 text-center"><span><b className="text-3xl text-cyan-300">-7.4</b><br />LUFS</span><span><b className="text-3xl text-cyan-300">-0.6</b><br />dBTP</span><span><b className="text-3xl text-cyan-300">6.2</b><br />LU</span><span><b className="text-3xl text-cyan-300">60%</b><br />Punch</span></div></div>
          <div className="rounded-2xl border border-white/10 bg-black/30 p-3 text-center"><p className="text-xs font-black uppercase">Stereo Field</p><div className="mx-auto mt-4 h-28 w-28 rounded-full border border-white/20 bg-[radial-gradient(circle,rgba(255,255,255,.7),rgba(14,165,233,.12),transparent_60%)]" /></div>
          <div className="rounded-2xl border border-white/10 bg-black/30 p-3 text-center"><p className="text-xs font-black uppercase">Phase</p><div className="mx-auto mt-4 h-24 w-8 rounded bg-gradient-to-t from-red-400 via-green-300 to-blue-400" /><p className="mt-2 text-xs">Correlation</p></div>
          <div className="rounded-2xl border border-white/10 bg-black/30 p-3 text-center"><p className="text-xs font-black uppercase">Limiter</p><p className="mt-6 rounded-xl bg-cyan-400/10 py-2 text-2xl text-cyan-300">-1.0</p><p className="mt-2 rounded-xl bg-cyan-400/10 py-2 text-2xl text-cyan-300">-0.5</p><button className="mt-3 rounded-xl border border-cyan-300/40 px-4 py-2 text-xs text-cyan-200">ENGAGED</button></div>
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4"><p className="text-xs font-black uppercase tracking-[0.2em]">Publish</p><div className="mt-4 grid grid-cols-3 gap-2 text-xs"><span className="rounded bg-white/5 p-2">WAV</span><span className="rounded bg-white/5 p-2">24 Bit</span><span className="rounded bg-white/5 p-2">Triangular</span></div><div className="mt-5 flex gap-4 text-2xl">▶ ☁ ● ♫</div><button className="mt-5 w-full rounded-xl border border-cyan-300/40 bg-cyan-400/10 py-3 text-xs font-black text-cyan-200">PUBLISH TRACK</button></div>
        </section>

        <footer className="mt-3 flex flex-wrap justify-between gap-3 border-t border-white/10 pt-3 text-[11px] uppercase tracking-[0.16em] text-white/45"><span>Epic Music Space v1.0.0</span><span>Project: Neon Nights</span><span>Status: Saved</span><span>CPU: 23% · DISK: 32% · MEM: 41% · MIDI</span></footer>
      </div>
    </main>
  );
}
