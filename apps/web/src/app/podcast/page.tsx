import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PodcastStudioPanel from "@/components/PodcastStudioPanel";
import { formatDurationLabel, formatPodcastEnum } from "@/lib/podcast";

export const metadata: Metadata = {
  title: "Podcast",
  description:
    "Build video-first podcasts on Epic Music Space with live sessions, clips, captions, transcripts, and creator growth loops.",
};

export default async function PodcastPage() {
  const session = await auth();
  const [studio, featuredShows] = await Promise.all([
    session?.user?.id
      ? prisma.studio.findFirst({
          where: { userId: session.user.id },
          select: { username: true },
        }).catch(() => null)
      : null,
    prisma.podcastShow.findMany({
      where: { isPublished: true },
      orderBy: [{ featured: "desc" }, { updatedAt: "desc" }],
      take: 6,
      include: {
        owner: { select: { name: true } },
        episodes: {
          where: { status: "PUBLISHED" },
          orderBy: { publishedAt: "desc" },
          take: 1,
          select: { title: true, slug: true, durationSec: true, publishedAt: true },
        },
        _count: { select: { episodes: true } },
      },
    }),
  ]);

  return (
    <div className="relative min-h-[calc(100vh-65px)] overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-[-180px] h-[420px] bg-[radial-gradient(circle,rgba(34,211,238,0.12),transparent_55%)]" />
      <div className="pointer-events-none absolute right-[-120px] top-40 h-[380px] w-[380px] rounded-full bg-fuchsia-500/10 blur-[140px]" />

      <header className="relative z-[1] mx-auto max-w-6xl px-4 pt-10 sm:pt-14">
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(103,232,249,0.9)]" />
          <p className="ems-kicker text-cyan-200/80">Podcast Network</p>
          <span className="ems-kicker ml-auto text-white/35">Video-first · Audio-ready</span>
        </div>
        <h1 className="ems-title mt-3 max-w-4xl text-white">
          Podcasting for creators who want a show, a clip engine, and a live audience loop.
        </h1>
        <p className="ems-sub mt-4 max-w-2xl text-white/65">
          Designed around the strongest modern pattern: record for video, cut for social, keep the audio pristine,
          and turn every episode into recurring community momentum.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href={session?.user?.id ? "/studio/podcast" : "/auth/signin?callbackUrl=/studio/podcast"}
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-cyan-400 to-brand-500 px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-slate-950 transition hover:opacity-95"
          >
            Open podcaster console →
          </Link>
          <Link
            href="/studio/live"
            className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/[0.05] px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-white/84 transition hover:bg-white/[0.08]"
          >
            Start a live show →
          </Link>
        </div>
      </header>

      <PodcastStudioPanel studioUsername={studio?.username ?? null} />

      <section className="relative z-[1] mx-auto max-w-6xl px-4 pb-16">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="ems-kicker text-brand-200/75">Featured shows</p>
            <h2 className="mt-2 text-3xl font-black uppercase tracking-[0.05em] text-white">What to watch now</h2>
          </div>
          <p className="max-w-sm text-right text-sm text-white/45">
            Video-first where it matters, audio-first when it should be frictionless.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {featuredShows.map((show) => {
            const latest = show.episodes[0] ?? null;
            return (
              <Link key={show.id} href={`/podcast/${show.slug}`} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 transition hover:border-brand-400/35 hover:bg-white/[0.06]">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-200/75">{formatPodcastEnum(show.format)} · {formatPodcastEnum(show.cadence)}</p>
                <h3 className="mt-3 text-2xl font-black uppercase tracking-[0.04em] text-white">{show.title}</h3>
                <p className="mt-2 line-clamp-3 text-sm leading-7 text-white/58">{show.tagline || show.description}</p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <Metric value={String(show._count.episodes)} label="Episodes" />
                  <Metric value={String(show.totalViews)} label="Views" />
                  <Metric value={show.owner.name || "Host"} label="Host" />
                </div>
                {latest && (
                  <div className="mt-4 rounded-2xl border border-white/8 bg-black/20 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Latest drop</p>
                    <p className="mt-2 text-sm font-semibold text-white">{latest.title}</p>
                    <p className="mt-1 text-xs text-white/45">{formatDurationLabel(latest.durationSec)} · {latest.publishedAt ? new Date(latest.publishedAt).toLocaleDateString() : "Coming soon"}</p>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-3">
      <p className="truncate text-sm font-black text-white">{value}</p>
      <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/38">{label}</p>
    </div>
  );
}