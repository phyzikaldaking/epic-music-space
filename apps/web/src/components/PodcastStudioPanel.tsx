"use client";

import Link from "next/link";

type PodcastStudioPanelProps = {
  studioUsername: string | null;
};

const workflow = [
  {
    step: "01",
    title: "Record video-first",
    body: "Build every episode as a video podcast first, then spin out the audio cut everywhere else.",
  },
  {
    step: "02",
    title: "Package for discovery",
    body: "Lead with a hard thumbnail, on-screen topic framing, captions, and clip moments worth sharing.",
  },
  {
    step: "03",
    title: "Run a weekly show loop",
    body: "Schedule the drop, drive the live room, cut highlight clips, and pull the audience into the next episode.",
  },
];

const formats = [
  {
    name: "In-Studio",
    label: "Best for flagship shows",
    body: "Two to four mic conversations with a branded set, clean camera blocking, and high-retention visual rhythm.",
  },
  {
    name: "Remote",
    label: "Best for guest access",
    body: "Browser-based guest sessions when the right conversation matters more than the room you are in.",
  },
  {
    name: "Audio + Visualizer",
    label: "Best for audio-first teams",
    body: "Ship strong audio now, pair it with cover art, captions, and clips, then graduate into full video later.",
  },
];

const deliverables = [
  "Full episode drop",
  "15s, 30s, and 60s clip cuts",
  "Transcript and caption pass",
  "Headline + thumbnail package",
  "Live aftershow room",
  "Timeline promo and fan prompts",
];

export default function PodcastStudioPanel({ studioUsername }: PodcastStudioPanelProps) {
  const studioHref = studioUsername ? `/studio/${studioUsername}` : "/studio/setup?next=%2Fstudio%2Fpodcast";

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-12">
      <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(244,114,182,0.16),transparent_30%),linear-gradient(145deg,rgba(8,12,18,0.98),rgba(17,12,28,0.95)_55%,rgba(25,14,15,0.96))] p-6 sm:p-8 lg:p-10">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />
        <div className="grid gap-8 lg:grid-cols-[1.3fr_0.9fr]">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-200/75">
              Podcast Console
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-black uppercase tracking-[0.04em] text-white sm:text-5xl">
              Build a podcast product, not just an upload.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/68 sm:text-base">
              The model is simple: record video-first, publish the full episode, cut social clips, add captions and transcripts,
              then convert the audience into live rooms, follows, and recurring weekly viewing habits.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/studio/live"
                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-cyan-400 to-brand-500 px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-slate-950 transition hover:opacity-95"
              >
                Start video session →
              </Link>
              <Link
                href="/timeline"
                className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/[0.05] px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-white/84 transition hover:bg-white/[0.08]"
              >
                Promote next episode →
              </Link>
              <Link
                href={studioHref}
                className="inline-flex items-center justify-center rounded-xl border border-fuchsia-400/30 bg-fuchsia-400/10 px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-fuchsia-100 transition hover:bg-fuchsia-400/15"
              >
                Open creator studio →
              </Link>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {workflow.map((item) => (
                <div key={item.step} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200/65">{item.step}</p>
                  <p className="mt-2 text-sm font-semibold text-white">{item.title}</p>
                  <p className="mt-2 text-xs leading-6 text-white/55">{item.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-black/30 p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <span aria-hidden className="h-2 w-2 rounded-full bg-rose-400 shadow-[0_0_16px_rgba(251,113,133,0.85)]" />
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/55">Weekly Show Loop</p>
            </div>
            <div className="mt-5 space-y-4">
              {[
                { title: "Monday", body: "Drop the flagship episode with the thumbnail, title angle, and transcript ready." },
                { title: "Wednesday", body: "Cut clip packs for Timeline and invite listeners into a live room discussion." },
                { title: "Friday", body: "Run the guest recap, push community prompts, and seed the next booking." },
              ].map((item) => (
                <div key={item.title} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-brand-200/80">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-white/65">{item.body}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-2xl border border-cyan-400/20 bg-cyan-400/8 p-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100/85">Best-practice loadout</p>
              <ul className="mt-3 grid gap-2 text-sm text-white/72">
                {deliverables.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-[1fr_1fr_1fr]">
        {formats.map((format) => (
          <div key={format.name} className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/45">{format.label}</p>
            <h2 className="mt-2 text-xl font-black uppercase tracking-[0.06em] text-white">{format.name}</h2>
            <p className="mt-3 text-sm leading-7 text-white/58">{format.body}</p>
          </div>
        ))}
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-200/75">Growth Stack</p>
          <h2 className="mt-2 text-2xl font-black uppercase tracking-[0.04em] text-white">What makes video podcasts win</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              {
                title: "Thumbnail discipline",
                body: "Every episode needs a visual hook strong enough to compete in feed-first platforms.",
              },
              {
                title: "Captions and transcripts",
                body: "Accessibility, search visibility, and clip retention all improve when the words are packaged on-screen.",
              },
              {
                title: "Remote guest readiness",
                body: "The best shows remove guest friction. One clean browser link beats a complicated recording workflow.",
              },
              {
                title: "Repurposing engine",
                body: "One long-form episode should generate promo cuts, quote cards, aftershows, and next-episode prompts.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                <p className="text-sm font-semibold text-white">{item.title}</p>
                <p className="mt-2 text-xs leading-6 text-white/55">{item.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-6">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-brand-200/75">Monetize the show</p>
          <h2 className="mt-2 text-2xl font-black uppercase tracking-[0.04em] text-white">Turn every episode into more surfaces</h2>
          <div className="mt-5 space-y-3 text-sm leading-7 text-white/62">
            <p>Host the live aftershow in Sessions.</p>
            <p>Sell consultation, production, or sponsorship work through Services.</p>
            <p>Use Timeline posts to tease clips, polls, and guest reveals.</p>
          </div>
          <div className="mt-6 grid gap-2">
            <Link href="/services" className="rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white/82 transition hover:bg-white/[0.07]">
              Open services marketplace →
            </Link>
            <Link href="/studio/live" className="rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white/82 transition hover:bg-white/[0.07]">
              Launch post-episode room →
            </Link>
            <Link href="/dashboard" className="rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white/82 transition hover:bg-white/[0.07]">
              Track creator performance →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}