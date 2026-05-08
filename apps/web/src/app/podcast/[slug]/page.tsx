import Link from "next/link";
import { notFound } from "next/navigation";
import AudioPlayer from "@/components/AudioPlayer";
import { prisma } from "@/lib/prisma";
import { formatDurationLabel, formatPodcastEnum } from "@/lib/podcast";

export const revalidate = 60;

export default async function PodcastShowPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const show = await prisma.podcastShow.findUnique({
    where: { slug },
    include: {
      owner: { select: { name: true, username: true } },
      episodes: {
        where: { status: "PUBLISHED" },
        orderBy: [{ publishedAt: "desc" }, { seasonNumber: "desc" }, { episodeNumber: "desc" }],
      },
    },
  });
  if (!show || !show.isPublished) notFound();

  const totalMinutes = Math.round(show.episodes.reduce((sum, episode) => sum + (episode.durationSec ?? 0), 0) / 60);
  const totalClips = show.episodes.reduce((sum, episode) => sum + episode.clipCount, 0);
  const latest = show.episodes[0] ?? null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_22%),linear-gradient(145deg,rgba(9,12,22,0.98),rgba(22,18,31,0.96))] p-6 sm:p-8 lg:p-10">
        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-200/80">Podcast show</p>
        <h1 className="mt-3 text-4xl font-black uppercase tracking-[0.04em] text-white sm:text-5xl">{show.title}</h1>
        <p className="mt-3 max-w-3xl text-base leading-8 text-white/64">{show.tagline || show.description}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <ShowStat label="Format" value={formatPodcastEnum(show.format)} />
          <ShowStat label="Cadence" value={formatPodcastEnum(show.cadence)} />
          <ShowStat label="Episodes" value={String(show.episodes.length)} />
          <ShowStat label="Views" value={String(show.totalViews)} />
        </div>
        {show.trailerAudioUrl && (
          <div className="mt-6">
            <AudioPlayer audioUrl={show.trailerAudioUrl} title={`${show.title} trailer`} />
          </div>
        )}
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/40">Episodes</p>
              <h2 className="mt-2 text-2xl font-black uppercase tracking-[0.04em] text-white">Published drops</h2>
            </div>
            {show.owner.username && (
              <p className="text-xs font-semibold text-white/45">Hosted by @{show.owner.username}</p>
            )}
          </div>
          <div className="mt-5 space-y-3">
            {show.episodes.map((episode) => (
              <Link key={episode.id} href={`/podcast/${show.slug}/${episode.slug}`} className="block rounded-2xl border border-white/8 bg-black/20 p-4 transition hover:border-brand-400/30 hover:bg-black/30">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">S{episode.seasonNumber} · E{episode.episodeNumber} · {episode.title}</p>
                    <p className="mt-2 text-sm leading-7 text-white/58">{episode.synopsis}</p>
                  </div>
                  <div className="text-right text-xs text-white/40">
                    <p>{formatDurationLabel(episode.durationSec)}</p>
                    <p className="mt-1">{episode.viewCount} views</p>
                    <p className="mt-1">{episode.clipCount} clips</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-brand-200/75">Analytics snapshot</p>
            <div className="mt-4 grid gap-3">
              <ShowStat label="Runtime" value={`${totalMinutes}m`} />
              <ShowStat label="Clip plan" value={String(totalClips)} />
              <ShowStat label="Latest" value={latest?.title ?? "No episodes yet"} />
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-200/75">Weekly loop</p>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-white/62">
              <li>Record the full episode in video-first format.</li>
              <li>Cut clips and captions for the timeline drop.</li>
              <li>Send listeners into a live aftershow room.</li>
            </ul>
          </div>
        </aside>
      </section>
    </div>
  );
}

function ShowStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">{label}</p>
      <p className="mt-2 text-lg font-black text-white">{value}</p>
    </div>
  );
}
