import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PodcastStudioPanel from "@/components/PodcastStudioPanel";
import PodcastStudioManager from "@/components/PodcastStudioManager";

export const metadata: Metadata = {
  title: "Podcaster Console",
  description:
    "Run your video podcast workflow on Epic Music Space: episode planning, live sessions, clips, captions, and audience growth.",
};

export default async function StudioPodcastPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/studio/podcast");
  }

  const [studio, shows] = await Promise.all([
    prisma.studio.findFirst({
      where: { userId: session.user.id },
      select: { username: true },
    }).catch(() => null),
    prisma.podcastShow.findMany({
      where: { ownerId: session.user.id },
      orderBy: [{ updatedAt: "desc" }],
      include: {
        episodes: {
          orderBy: [{ seasonNumber: "desc" }, { episodeNumber: "desc" }, { createdAt: "desc" }],
          take: 12,
          select: {
            id: true,
            title: true,
            slug: true,
            status: true,
            seasonNumber: true,
            episodeNumber: true,
            audioUrl: true,
            muxPlaybackId: true,
            videoStatus: true,
            publishedAt: true,
            viewCount: true,
            playCount: true,
            clipCount: true,
          },
        },
      },
    }),
  ]);

  return (
    <div className="relative min-h-[calc(100vh-65px)]">
      <header className="relative z-[1] mx-auto max-w-6xl px-4 pt-10 sm:pt-14">
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-2 w-2 rounded-full bg-rose-400 shadow-[0_0_14px_rgba(251,113,133,0.8)]" />
          <p className="studio-label text-cyan-200/80">EMS Studio · Podcaster Console</p>
          <span className="studio-label ml-auto text-white/35">PC-01 · Live Format</span>
        </div>
        <h1 className="mt-3 font-display text-3xl uppercase tracking-wider text-white sm:text-5xl">
          Build your next episode like a full media product.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/60">
          Video-first where it matters, audio everywhere else, with clips, captions, transcripts, and live sessions driving the weekly loop.
        </p>
      </header>

      <PodcastStudioPanel studioUsername={studio?.username ?? null} />
      <PodcastStudioManager
        initialShows={shows.map((show) => ({
          id: show.id,
          title: show.title,
          slug: show.slug,
          tagline: show.tagline,
          description: show.description,
          category: show.category,
          format: show.format,
          cadence: show.cadence,
          coverUrl: show.coverUrl,
          bannerUrl: show.bannerUrl,
          isPublished: show.isPublished,
          totalViews: show.totalViews,
          episodes: show.episodes.map((episode) => ({
            ...episode,
            status: episode.status,
            videoStatus: episode.videoStatus,
            publishedAt: episode.publishedAt?.toISOString() ?? null,
          })),
        }))}
      />
    </div>
  );
}