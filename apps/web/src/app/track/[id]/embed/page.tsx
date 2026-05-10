import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site";
import { getStreamUrl } from "@/lib/audioStream";
import { issueStreamToken } from "@/lib/streamToken";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export const revalidate = 60;

/**
 * Iframe-friendly embeddable mini-player for a track. Use:
 *   <iframe src="https://epicmusicspace.com/track/{id}/embed"
 *           width="600" height="160" frameborder="0"
 *           allow="autoplay; clipboard-write"></iframe>
 *
 * Compact, brand-aware, no nav, deep-links back to the full track page on click.
 * Streaming uses a short-lived token so the embed can play immediately without
 * requiring the visitor to be logged in.
 */
export default async function TrackEmbedPage({ params }: Props) {
  const { id } = await params;
  const song = await prisma.song.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      artist: true,
      coverUrl: true,
      genre: true,
      bpm: true,
      audioUrl: true,
      isActive: true,
      isDraft: true,
    },
  });
  if (!song || !song.isActive || song.isDraft) notFound();

  // Issue a short-lived streaming token for anonymous embed playback so
  // the visitor doesn't need to be signed in. Same proxy the track page
  // uses — content protection (throttling, fingerprinting) still applies.
  const streamToken = issueStreamToken({
    songId: song.id,
    userId: null,
    ttlSeconds: 60 * 60,
  });
  const streamUrl = getStreamUrl(song.id, streamToken);
  const trackHref = `${getSiteUrl()}/track/${song.id}`;

  return (
    <div className="min-h-screen bg-[#0a0a14] p-3">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#11091e] via-[#1a0f2e] to-[#0a0a14] p-3 text-white">
        <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-white/45">
          <span className="flex items-center gap-1.5">
            <span className="text-brand-300">●</span> Epic Music Space
          </span>
          {song.bpm && (
            <span className="font-mono text-cyan-200/70">{song.bpm} BPM</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={trackHref}
            target="_top"
            className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-brand-900 hover:opacity-90 transition"
            title={`Open ${song.title} on Epic Music Space`}
          >
            {song.coverUrl ? (
              <Image src={song.coverUrl} alt="" fill unoptimized className="object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl">🎵</div>
            )}
          </Link>

          <div className="min-w-0 flex-1">
            <Link
              href={trackHref}
              target="_top"
              className="block truncate text-sm font-bold hover:text-brand-200 transition"
            >
              {song.title}
            </Link>
            <p className="truncate text-xs text-white/55">
              {song.artist}
              {song.genre ? <span className="text-white/30"> · {song.genre}</span> : null}
            </p>

            <audio
              controls
              preload="none"
              src={streamUrl}
              className="mt-2 h-8 w-full"
              controlsList="nodownload"
            />
          </div>
        </div>

        <Link
          href={trackHref}
          target="_top"
          className="mt-2 block text-center text-[10px] font-bold uppercase tracking-widest text-brand-300 hover:text-brand-200 transition"
        >
          License this track →
        </Link>
      </div>
    </div>
  );
}
