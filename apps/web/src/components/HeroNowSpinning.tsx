import Link from "next/link";
import Image from "next/image";
import { formatPrice } from "@ems/utils";

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

function StaticPreviewStrip({ title, href }: { title: string; href: string }) {
  return (
    <Link
      href={href}
      className="group relative block overflow-hidden rounded-2xl border border-white/10 bg-black/35 p-3 transition hover:border-cyan-200/35 hover:bg-white/[0.04]"
      aria-label={`Open ${title} track page to play preview`}
    >
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full border border-cyan-200/25 bg-cyan-300/10 text-cyan-100 transition group-hover:bg-cyan-300/20">
          <svg className="ml-0.5 h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/35">
            Preview ready
          </p>
          <div className="mt-2 h-8 overflow-hidden rounded-xl border border-white/10 bg-black/45">
            <div className="h-full bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.18)_0_2px,transparent_2px_9px)] opacity-70" />
          </div>
        </div>
        <span className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white/50 sm:inline-flex">
          Open Track →
        </span>
      </div>
    </Link>
  );
}

export default function HeroNowSpinning({ song, secondary }: Props) {
  const claimed = song.totalLicenses > 0
    ? Math.round((song.soldLicenses / song.totalLicenses) * 100)
    : 0;
  const trackHref = `/track/${song.id}`;

  return (
    <section
      aria-label="Now spinning on the floor"
      className="mx-auto mt-8 w-full max-w-2xl rounded-2xl border border-white/12 bg-[linear-gradient(135deg,rgba(255,45,146,0.10),rgba(0,0,0,0.55)_55%,rgba(34,211,238,0.08))] p-4 text-left shadow-[0_30px_80px_-30px_rgba(255,45,146,0.45)] backdrop-blur-xl sm:p-5"
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <Link
          href={trackHref}
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
          <Link href={trackHref} className="mt-0.5 block hover:text-accent-300">
            <p className="line-clamp-1 text-base font-black text-white sm:text-lg">{song.title}</p>
          </Link>
          <p className="line-clamp-1 text-xs text-white/55 sm:text-sm">{song.artist}</p>

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
          href={trackHref}
          className="hidden flex-shrink-0 self-center rounded-full border border-white/12 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/65 transition hover:bg-white/10 sm:inline-flex"
        >
          {formatPrice(song.licensePrice)} / license →
        </Link>
      </div>

      <div className="mt-3 sm:mt-4">
        <StaticPreviewStrip title={song.title} href={trackHref} />
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
