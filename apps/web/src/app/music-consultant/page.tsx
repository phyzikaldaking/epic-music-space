import Link from "next/link";

const services = [
  { name: "Copyright Office", type: "Composition + sound recording", detail: "Create a registration checklist for your song, lyrics, beat, and master.", href: "https://www.copyright.gov/registration/" },
  { name: "SoundExchange", type: "Digital performance royalties", detail: "Register the featured artist, rights owner, and sound recording details for eligible digital performances.", href: "https://register.soundexchange.com/" },
  { name: "The MLC", type: "U.S. digital mechanical royalties", detail: "Prepare your work title, writers, shares, publisher, and recording information.", href: "https://portal.themlc.com/songwriter/" },
  { name: "ASCAP", type: "Performance rights organization", detail: "Use the checklist to prepare songwriter, publisher, IPI, and work-registration information.", href: "https://www.ascap.com/" },
  { name: "BMI", type: "Performance rights organization", detail: "Use the checklist to prepare writer, publisher, split, and cue-sheet information.", href: "https://www.bmi.com/" },
];

export default function MusicConsultantPage() {
  return (
    <main className="min-h-screen bg-[#07090d] px-6 py-12 text-white">
      <div className="mx-auto max-w-6xl">
        <Link href="/" className="text-sm text-cyan-200">← Epic Music Space</Link>
        <div className="mt-10 max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-emerald-300">Music Consultant</p>
          <h1 className="mt-4 text-5xl font-black tracking-tight">Get your music registered. Get closer to getting paid.</h1>
          <p className="mt-5 text-lg leading-8 text-white/60">HQ helps artists organize ownership, splits, registrations, identifiers, and royalty collection steps in one clear workflow.</p>
        </div>

        <section className="mt-10 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-cyan-300/20 bg-cyan-300/[0.06] p-6">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-200">HQ · Your music-business guide</p>
            <h2 className="mt-3 text-2xl font-bold">Start with one song</h2>
            <p className="mt-2 text-sm leading-6 text-white/55">Tell HQ the song title, writers, producer, publisher, release status, and where it has played. HQ returns a personalized checklist and flags missing information.</p>
            <Link href="/music-consultant/hq" className="mt-6 inline-flex rounded-xl bg-cyan-200 px-5 py-3 text-sm font-black text-black">Open HQ</Link>
          </div>
          <div className="rounded-3xl border border-amber-300/20 bg-amber-300/[0.06] p-6">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-amber-200">Human consulting</p>
            <h2 className="mt-3 text-2xl font-bold">$75 / hour</h2>
            <p className="mt-2 text-sm leading-6 text-white/55">Book a focused session with William or an EMS consultant for registrations, splits, release setup, royalty cleanup, or career strategy.</p>
            <a href="mailto:consulting@epicmusicspace.com?subject=Music%20Consulting%20Session" className="mt-6 inline-flex rounded-xl bg-amber-200 px-5 py-3 text-sm font-black text-black">Request a session</a>
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-end justify-between gap-4">
            <div><p className="text-xs font-black uppercase tracking-[0.25em] text-white/40">Rights map</p><h2 className="mt-2 text-3xl font-bold">Where artists commonly register</h2></div>
            <p className="max-w-sm text-right text-xs leading-5 text-white/40">The destination depends on the right being collected. One registration does not collect every royalty.</p>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {services.map((service) => <a key={service.name} href={service.href} target="_blank" rel="noreferrer" className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-emerald-300/40 hover:bg-white/[0.06]"><p className="text-lg font-bold">{service.name}</p><p className="mt-1 text-xs uppercase tracking-[0.18em] text-emerald-200/75">{service.type}</p><p className="mt-4 text-sm leading-6 text-white/55">{service.detail}</p><span className="mt-5 block text-xs font-bold text-cyan-200">Open official portal ↗</span></a>)}
          </div>
        </section>

        <p className="mt-12 max-w-3xl text-xs leading-5 text-white/35">HQ provides educational organization and workflow support, not legal, tax, or financial advice. Artists should review final registrations, ownership splits, contracts, and claims with the relevant organization or a qualified professional.</p>
      </div>
    </main>
  );
}
