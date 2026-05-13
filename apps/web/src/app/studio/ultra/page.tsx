import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Studio Ultra",
  description:
    "The upgraded EMS Studio surface: faster workflows, stronger visuals, and pro-level control in the browser.",
};

const upgrades = [
  { title: "Real-time collaboration presence", detail: "Live collaborator focus states and room awareness while editing.", status: "Live" },
  { title: "Plugin-style routing depth", detail: "Track FX chains, sends, returns, and master flow tuned for production work.", status: "Live" },
  { title: "Take lanes + comp workflow", detail: "Multi-pass recording review and lane-level control for faster vocal decisions.", status: "Live" },
  { title: "Auto-save + crash recovery", detail: "Session heartbeat, restore points, and no-drama recovery when browsers fail.", status: "Live" },
  { title: "Reference A/B strategy", detail: "Faster compare loops and consistency checks while shaping final tone.", status: "Live" },
  { title: "Advanced MIDI control", detail: "MIDI routing and control mapping for performance and arrangement speed.", status: "Live" },
  { title: "Multi-mic workflow readiness", detail: "Live Preview: source map, phase checklist, take-lane routing, and review flow are now exposed for session setup.", status: "Live Preview" },
  { title: "Transient-to-MIDI assistance", detail: "Live Preview: groove extraction workflow now shows detect, quantize, convert, audition, and export steps.", status: "Live Preview" },
  { title: "Scene snapshots + morphing", detail: "Save mix states and glide between scene snapshots during arrangement.", status: "Live" },
  { title: "Sound/preset discovery upgrade", detail: "Search-first navigation, smarter grouping, and performance-minded browsing.", status: "Live" },
  { title: "CPU-aware quality scaling", detail: "Live-performance stability with quality targeting tuned by session load.", status: "Live" },
  { title: "Mastering export assistant", detail: "Streaming and release-target workflows integrated into export behaviors.", status: "Live" },
  { title: "Control-surface friendly UX", detail: "Large-control ergonomics and clear transport/readout hierarchy.", status: "Live" },
  { title: "AI vocal cleanup helpers", detail: "Guided chain suggestions for de-ess, leveling, tonal cleanup, and polish.", status: "Live" },
  { title: "Project lifecycle controls", detail: "Versioning, relink-safe flow, and production session continuity improvements.", status: "Live" },
] as const;

const multiMicSteps = [
  "Arm vocal, room, instrument, and aux sources before the take.",
  "Label each input with role, distance, and intended routing.",
  "Check polarity/phase before comping or committing takes.",
  "Send selected sources into take lanes for fast review.",
  "Route approved lanes into compact mixer channels for plugin-style processing.",
];

const transientMidiSteps = [
  "Drop or record a drum, percussion, bass, or melodic audio phrase.",
  "Detect transients and separate strong hits from ghost notes.",
  "Choose sensitivity, swing, quantize strength, and velocity behavior.",
  "Preview the extracted MIDI groove against the original loop.",
  "Send the MIDI pattern to drums, bass, synth, or export for arrangement.",
];

function WorkflowCard({
  title,
  eyebrow,
  description,
  steps,
  primaryHref,
  primaryLabel,
  accent,
}: {
  title: string;
  eyebrow: string;
  description: string;
  steps: readonly string[];
  primaryHref: string;
  primaryLabel: string;
  accent: "cyan" | "magenta";
}) {
  const accentClasses =
    accent === "cyan"
      ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
      : "border-fuchsia-300/25 bg-fuchsia-300/10 text-fuchsia-100";

  return (
    <article className="rounded-2xl border border-white/12 bg-black/35 p-5 shadow-[0_24px_80px_-44px_rgba(34,211,238,0.45)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">{eyebrow}</p>
          <h3 className="mt-2 text-xl font-black uppercase tracking-[0.06em] text-white">{title}</h3>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${accentClasses}`}>
          Live Preview
        </span>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-white/70">{description}</p>
      <ol className="mt-5 space-y-2">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-3 text-sm text-white/72">
            <span className={`grid h-6 w-6 flex-shrink-0 place-items-center rounded-full border text-[11px] font-black ${accentClasses}`}>
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <Link
        href={primaryHref}
        className={`mt-5 inline-flex items-center rounded-md border px-4 py-2 text-xs font-black uppercase tracking-[0.16em] transition hover:bg-white/10 ${accentClasses}`}
      >
        {primaryLabel}
      </Link>
    </article>
  );
}

export default function StudioUltraPage() {
  return (
    <main className="min-h-[calc(100vh-65px)] bg-[#05060d] text-white">
      <section
        className="relative overflow-hidden border-b border-white/10"
        style={{
          backgroundImage:
            "linear-gradient(to bottom, rgba(4,6,14,0.38), rgba(4,6,14,0.82)), url('https://images.unsplash.com/photo-1461783436728-0a9217714694?auto=format&fit=crop&w=2200&q=80')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <div className="inline-flex items-center gap-2 rounded-md border border-cyan-300/30 bg-black/45 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-cyan-100">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
            Studio Ultra Is Live
          </div>
          <h1 className="mt-5 max-w-4xl text-4xl font-black uppercase tracking-[0.03em] sm:text-6xl">
            Better Graphics.
            <br />
            Better Studio.
            <br />
            Better Workflow.
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-relaxed text-white/80 sm:text-lg">
            This is the upgraded studio surface now connected to production: performance-first visuals,
            faster navigation, stronger AI assist behavior, and a clearer path from idea to publish.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/studio/try?force-desktop=1"
              className="inline-flex items-center rounded-md border border-cyan-300/40 bg-cyan-500/20 px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-cyan-100"
            >
              Open Full Studio
            </Link>
            <Link
              href="/studio/live"
              className="inline-flex items-center rounded-md border border-white/20 bg-black/45 px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-white/90"
            >
              Open Live Sessions
            </Link>
            <Link
              href="/ai"
              className="inline-flex items-center rounded-md border border-white/20 bg-black/45 px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-white/90"
            >
              Open AI Tools
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-10 lg:grid-cols-2">
        <WorkflowCard
          eyebrow="Capture Workflow"
          title="Multi-Mic Session Map"
          description="Turns the previous readiness note into a usable setup flow for wider source capture: source labels, phase checks, take lanes, and compact mixer routing."
          steps={multiMicSteps}
          primaryHref="/studio/try?force-desktop=1"
          primaryLabel="Open Studio Capture"
          accent="cyan"
        />
        <WorkflowCard
          eyebrow="AI Groove Workflow"
          title="Transient-to-MIDI Assistant"
          description="Turns the analysis pipeline into a visible groove-extraction workflow so creators understand how audio becomes editable MIDI patterns."
          steps={transientMidiSteps}
          primaryHref="/ai"
          primaryLabel="Open AI Tools"
          accent="magenta"
        />
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:py-14">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-cyan-200/80">Upgrade Matrix</p>
            <h2 className="mt-2 text-2xl font-bold uppercase tracking-[0.08em] sm:text-3xl">
              What’s Upgraded
            </h2>
          </div>
          <p className="text-xs uppercase tracking-[0.18em] text-white/50">15 Core Improvements</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {upgrades.map((item) => (
            <article key={item.title} className="rounded-lg border border-white/12 bg-white/[0.04] p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-bold uppercase tracking-[0.07em] text-white">{item.title}</p>
                <span
                  className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${
                    item.status === "Live"
                      ? "border border-emerald-300/35 bg-emerald-500/20 text-emerald-100"
                      : "border border-cyan-300/35 bg-cyan-500/20 text-cyan-100"
                  }`}
                >
                  {item.status}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-white/72">{item.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
