import Link from "next/link";
import { notFound } from "next/navigation";
import AudioPlayer from "@/components/AudioPlayer";
import PodcastEpisodeViewBeacon from "@/components/PodcastEpisodeViewBeacon";
import { prisma } from "@/lib/prisma";
import { formatDurationLabel } from "@/lib/podcast";

export const revalidate = 60;

export default async function PodcastEpisodePage({ params }: { params: Promise<{ slug: string; episodeSlug: string }> }) {
  const { slug, episodeSlug } = await params;
  const show = await prisma.podcastShow.findUnique({
    where: { slug },
    include: {
      episodes: {
        where: { status: "PUBLISHED" },
        orderBy: [{ publishedAt: "desc" }, { seasonNumber: "desc" }, { episodeNumber: "desc" }],
      },
    },
  });
  if (!show || !show.isPublished) notFound();
  const episode = show.episodes.find((candidate) => candidate.slug === episodeSlug);
  if (!episode) notFound();

  const episodeIndex = show.episodes.findIndex((candidate) => candidate.id === episode.id);
  const nextEpisode = episodeIndex > 0 ? show.episodes[episodeIndex - 1] : null;
  const previousEpisode = episodeIndex >= 0 && episodeIndex < show.episodes.length - 1 ? show.episodes[episodeIndex + 1] : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <PodcastEpisodeViewBeacon episodeId={episode.id} />
      <Link href={`/podcast/${show.slug}`} className="text-sm text-cyan-200/80 hover:text-cyan-100">← Back to {show.title}</Link>

      <section className="mt-4 rounded-[32px] border border-white/10 bg-[linear-gradient(145deg,rgba(8,11,18,0.98),rgba(25,14,30,0.96))] p-6 sm:p-8">
        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-brand-200/75">Episode</p>
        <h1 className="mt-3 text-4xl font-black uppercase tracking-[0.04em] text-white">{episode.title}</h1>
        <p className="mt-3 text-sm leading-8 text-white/64">{episode.synopsis}</p>
        <div className="mt-5 flex flex-wrap gap-2 text-xs text-white/45">
          <span>S{episode.seasonNumber}</span>
          <span>•</span>
          <span>E{episode.episodeNumber}</span>
          <span>•</span>
          <span>{formatDurationLabel(episode.durationSec)}</span>
          <span>•</span>
          <span>{episode.viewCount} views</span>
          <span>•</span>
          <span>{episode.clipCount} clips</span>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-4">
          {episode.muxPlaybackId ? (
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-black">
              <video
                controls
                playsInline
                preload="metadata"
                className="aspect-video w-full"
                src={`https://stream.mux.com/${episode.muxPlaybackId}.m3u8`}
                poster={episode.coverUrl ?? undefined}
              />
            </div>
          ) : episode.audioUrl ? (
            <AudioPlayer audioUrl={episode.audioUrl} title={episode.title} />
          ) : (
            <div className="rounded-3xl border border-dashed border-white/12 bg-black/20 p-8 text-center text-sm text-white/55">
              Media is still being packaged for this episode.
            </div>
          )}

          {episode.transcript && (
            <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-200/75">Transcript</p>
              <div className="mt-4 whitespace-pre-line text-sm leading-8 text-white/68">{episode.transcript}</div>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/40">Episode stats</p>
            <div className="mt-4 grid gap-3">
              <MiniStat label="Views" value={String(episode.viewCount)} />
              <MiniStat label="Plays" value={String(episode.playCount)} />
              <MiniStat label="Clips" value={String(episode.clipCount)} />
            </div>
            {episode.captionsUrl && (
              <a href={episode.captionsUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-cyan-100">
                Open captions →
              </a>
            )}
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-brand-200/75">Keep watching</p>
            <div className="mt-4 space-y-3">
              {nextEpisode && (
                <Link href={`/podcast/${show.slug}/${nextEpisode.slug}`} className="block rounded-2xl border border-white/8 bg-black/20 p-4 text-sm text-white/80">
                  Next up: {nextEpisode.title}
                </Link>
              )}
              {previousEpisode && (
                <Link href={`/podcast/${show.slug}/${previousEpisode.slug}`} className="block rounded-2xl border border-white/8 bg-black/20 p-4 text-sm text-white/80">
                  Previous: {previousEpisode.title}
                </Link>
              )}
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">{label}</p>
      <p className="mt-2 text-lg font-black text-white">{value}</p>
    </div>
  );
}
