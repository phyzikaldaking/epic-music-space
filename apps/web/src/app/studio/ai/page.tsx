import Link from "next/link";

export const metadata = {
  title: "AI Studio",
  description: "AI engineer, producer, mix doctor, mastering, publishing, and session guidance for Epic Music Space creators.",
};

const AI_ROLES = [
  {
    name: "AI Engineer",
    status: "Flagship",
    icon: "🎚️",
    accent: "cyan",
    description:
      "Guides artists through recording, mic checks, gain staging, headphone mix, vocal cleanup, punch-ins, takes, comping, and session readiness.",
    jobs: [
      "Set input level before recording",
      "Warn when vocals clip or sit too low",
      "Recommend retakes and punch-in points",
      "Build vocal chains for clean, raw, radio, and battle takes",
      "Explain what to do in plain language while the artist records",
    ],
  },
  {
    name: "AI Producer",
    status: "Next",
    icon: "🥁",
    accent: "violet",
    description:
      "Helps pick BPM, key, drum patterns, arrangement direction, song structure, hooks, bridges, drops, and beat energy.",
    jobs: [
      "Suggest beat direction from artist intent",
      "Create arrangement maps",
      "Recommend hook timing",
      "Suggest drum and 808 variation",
      "Turn voice notes into song sections",
    ],
  },
  {
    name: "AI Mix Doctor",
    status: "Next",
    icon: "🩺",
    accent: "emerald",
    description:
      "Diagnoses a mix like a real engineer: vocal level, muddiness, harshness, 808/kick masking, phase, stereo width, and loudness.",
    jobs: [
      "Detect clipping and low vocal level",
      "Find low-end masking",
      "Suggest EQ and compressor moves",
      "Compare against reference tracks",
      "Generate radio, club, performance, and streaming mix notes",
    ],
  },
  {
    name: "AI Mastering Engineer",
    status: "Planned",
    icon: "📀",
    accent: "amber",
    description:
      "Prepares release-ready masters for streaming, club, broadcast, battle, TikTok, and sync placement targets.",
    jobs: [
      "Target LUFS and true peak",
      "Check mono compatibility",
      "Create alternate masters",
      "Flag distortion risk",
      "Prepare export checklist",
    ],
  },
  {
    name: "AI A&R",
    status: "Planned",
    icon: "👑",
    accent: "pink",
    description:
      "Judges market readiness, strongest song sections, artist identity, release sequence, audience lane, and content angles.",
    jobs: [
      "Rate hook strength",
      "Suggest release strategy",
      "Find best 15-second clip",
      "Recommend collaborations",
      "Generate A&R notes after each session",
    ],
  },
  {
    name: "AI Publishing Assistant",
    status: "Planned",
    icon: "🚀",
    accent: "blue",
    description:
      "Turns a finished session into a release: title, description, licensing terms, split reminders, promo copy, and marketplace checklist.",
    jobs: [
      "Check metadata completeness",
      "Suggest licensing price tiers",
      "Create promo captions",
      "Prepare battle entry copy",
      "Confirm splits and credits before publish",
    ],
  },
];

const ENGINEER_FLOW = [
  {
    step: "01",
    title: "Mic + room check",
    body: "AI asks what mic/interface the artist has, checks room noise, confirms headphones, and gives a simple setup instruction.",
  },
  {
    step: "02",
    title: "Gain staging",
    body: "AI watches signal level and tells the artist to move closer, back up, turn the input down, or record hotter before the take is ruined.",
  },
  {
    step: "03",
    title: "Record coach",
    body: "AI runs the session like an engineer: count-in, punch-in, retake suggestions, breath/noise warnings, and confidence notes.",
  },
  {
    step: "04",
    title: "Vocal chain",
    body: "AI recommends clean vocal, aggressive rap vocal, melodic vocal, adlib, and performance presets based on the artist's sound.",
  },
  {
    step: "05",
    title: "Session report",
    body: "AI summarizes best takes, weak spots, mix risks, release readiness, and next steps so the artist knows exactly what to do.",
  },
];

function toneClasses(accent: string): string {
  switch (accent) {
    case "cyan":
      return "border-cyan-300/30 bg-cyan-300/10 text-cyan-100";
    case "violet":
      return "border-violet-300/30 bg-violet-300/10 text-violet-100";
    case "emerald":
      return "border-emerald-300/30 bg-emerald-300/10 text-emerald-100";
    case "amber":
      return "border-amber-300/30 bg-amber-300/10 text-amber-100";
    case "pink":
      return "border-pink-300/30 bg-pink-300/10 text-pink-100";
    default:
      return "border-blue-300/30 bg-blue-300/10 text-blue-100";
  }
}

export default function AiStudioPage() {
  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_34%),linear-gradient(135deg,rgba(6,12,24,0.98),rgba(4,4,8,0.96)_48%,rgba(35,12,48,0.88))] p-6 shadow-2xl shadow-cyan-950/25 md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-4xl">
              <p className="text-xs font-black uppercase tracking-[0.45em] text-cyan-200/80">Epic Music Space AI Studio</p>
              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-6xl">An AI-ran control room for artists who just want to record.</h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-white/65">
                The first flagship role is the AI Engineer: a recording coach, mix assistant, session organizer, and vocal-chain guide built directly for the EMS Studio experience.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/studio/board" className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black uppercase tracking-[0.22em] text-black hover:bg-cyan-200">
                  Open Studio Board
                </Link>
                <Link href="/studio/pro-mix" className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-black uppercase tracking-[0.22em] text-white/85 hover:bg-white/10">
                  Open Pro Mix
                </Link>
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-black/35 p-5 lg:w-[360px]">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Flagship build target</p>
              <h2 className="mt-2 text-2xl font-black">AI Engineer</h2>
              <p className="mt-2 text-sm leading-6 text-white/60">Help people record correctly even if they have never used a DAW, interface, mic chain, or engineering workflow.</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {AI_ROLES.map((role) => (
            <article key={role.name} className={`rounded-3xl border p-5 ${toneClasses(role.accent)}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-3xl">{role.icon}</p>
                  <h2 className="mt-3 text-2xl font-black text-white">{role.name}</h2>
                </div>
                <span className="rounded-full border border-white/15 bg-black/30 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/60">{role.status}</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-white/65">{role.description}</p>
              <div className="mt-4 space-y-2">
                {role.jobs.map((job) => (
                  <p key={job} className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/70">✓ {job}</p>
                ))}
              </div>
            </article>
          ))}
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 md:p-8">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.35em] text-cyan-200/70">AI Engineer session flow</p>
            <h2 className="mt-3 text-3xl font-black md:text-4xl">The recording workflow EMS should own.</h2>
            <p className="mt-3 text-sm leading-6 text-white/60">This is the core product loop: an artist opens the Studio, turns on AI Engineer, and gets coached through a clean recording session like a real engineer is sitting beside them.</p>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-5">
            {ENGINEER_FLOW.map((item) => (
              <div key={item.step} className="rounded-3xl border border-cyan-300/15 bg-black/35 p-4">
                <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-200/70">{item.step}</p>
                <h3 className="mt-3 text-lg font-black">{item.title}</h3>
                <p className="mt-2 text-xs leading-5 text-white/55">{item.body}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
