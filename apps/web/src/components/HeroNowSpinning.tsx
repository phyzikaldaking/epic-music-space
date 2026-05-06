"use client";

import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { formatPrice } from "@ems/utils";

// Lazy the heavy player so the hero ships fast and the audio engine only
// loads when the visitor actually scrolls or interacts.
const AudioPlayer = dynamic(() => import("@/components/LazyAudioPlayer"), {
  ssr: false,
  loading: () => (
    <div className="h-9 animate-pulse rounded-full bg-white/5" aria-hidden="true" />
  ),
});

interface HeroSong {
  id: string;
  title: string;
  artist: string;
  genre: string | null;
  audioUrl: string;
  coverUrl?: string | null;
  bpm: number | null;
  key: string | null;
  licensePrice: string;
  revenueSharePct: string;
  totalLicenses: number;
  soldLicenses: number;
}

interface Props {
  song: HeroSong;
  /** Optional second track shown as an "up next" chip. */
  secondary?: HeroSong | null;
}

export default function HeroNowSpinning({ song, secondary }: Props) {
  const claimed = song.totalLicenses > 0
    ? Math.round((song.soldLicenses / song.totalLicenses) * 100)
    : 0;

  return (
    <section
      aria-label="Now spinning on the floor"
      className="mx-auto mt-8 w-full max-w-2xl rounded-2xl border border-white/12 bg-[linear-gradient(135deg,rgba(255,45,146,0.10),rgba(0,0,0,0.55)_55%,rgba(34,211,238,0.08))] p-4 text-left shadow-[0_30px_80px_-30px_rgba(255,45,146,0.45)] backdrop-blur-xl sm:p-5"
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <Link
          href={`/track/${song.id}`}
          className="relative block h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border border-white/12 sm:h-20 sm:w-20"
          aria-label={`${song.title} by ${song.artist} — open track page`}
        >
          {song.coverUrl ? (
            <Image
              src={song.coverUrl}
              alt=""
              fill
              sizes="80px"
              className="object-cover"
              priority
            />
          ) : (
            <div className="h-full w-full bg-[radial-gradient(circle_at_25%_20%,rgba(255,45,146,0.5),transparent_55%),linear-gradient(135deg,#171126,#06080d)]" />
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" aria-hidden="true" />
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-200">
              Now spinning
            </p>
          </div>
          <Link href={`/track/${song.id}`} className="mt-0.5 block hover:text-accent-300">
            <p className="line-clamp-1 text-base font-black text-white sm:text-lg">{song.title}</p>
          </Link>
          <p className="line-clamp-1 text-xs text-white/55 sm:text-sm">{song.artist}</p>

          {/* Spec chips — surface the data points the platform makes a point
              of being honest about (BPM, key, licenses claimed). */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em]">
            {song.genre && (
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-white/60">
                {song.genre}
              </span>
            )}
            {song.bpm && (
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-white/60">
                {song.bpm} BPM
              </span>
            )}
            {song.key && (
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-white/60">
                {song.key}
              </span>
            )}
            <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-0.5 text-emerald-200">
              {song.soldLicenses}/{song.totalLicenses} claimed · {claimed}%
            </span>
          </div>
        </div>

        <Link
          href={`/track/${song.id}`}
          className="hidden flex-shrink-0 self-center rounded-full border border-white/12 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/65 transition hover:bg-white/10 sm:inline-flex"
        >
          {formatPrice(song.licensePrice)} / license →
        </Link>
      </div>

      {/* Inline waveform-style player. Streams through our own /api proxy
          via getStreamUrl inside <AudioPlayer>. */}
      <div className="mt-3 sm:mt-4">
        <AudioPlayer audioUrl={song.audioUrl} title={song.title} songId={song.id} />
      </div>

      {secondary && (
        <Link
          href={`/track/${secondary.id}`}
          className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-black/25 px-3 py-2 text-xs text-white/55 hover:border-white/20 hover:text-white"
        >
          <span className="line-clamp-1">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200/85">Up next ·</span>{" "}
            <span className="font-semibold text-white/85">{secondary.title}</span>
            <span className="text-white/40"> by {secondary.artist}</span>
          </span>
          <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
            {formatPrice(secondary.licensePrice)}
          </span>
        </Link>
      )}
    </section>
  );
}
