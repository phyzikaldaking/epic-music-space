import { formatPrice } from "@ems/utils";

interface SongCardProps {
  id: string;
  title: string;
  artist: string;
  genre?: string | null;
  coverUrl?: string | null;
  licensePrice: string | number;
  revenueSharePct: string | number;
  soldLicenses: number;
  totalLicenses: number;
}

export default function SongCard({
  id,
  title,
  artist,
  genre,
  coverUrl,
  licensePrice,
  revenueSharePct,
  soldLicenses,
  totalLicenses,
}: SongCardProps) {
  const remaining = totalLicenses - soldLicenses;
  const remainingPct = Math.round((remaining / totalLicenses) * 100);

  return (
    <a
      href={`/studio/${id}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition hover:border-brand-500/50 hover:bg-white/10"
    >
      {/* Cover art */}
      <div className="relative h-48 w-full bg-gradient-to-br from-brand-900 to-accent-600 overflow-hidden">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt={`${title} cover`}
            className="h-full w-full object-cover opacity-80 group-hover:opacity-100 transition"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-5xl">
            🎵
          </div>
        )}
        {genre && (
          <span className="absolute top-3 right-3 rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-medium text-white/80">
            {genre}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="font-semibold text-white line-clamp-1">{title}</h3>
          <p className="text-sm text-white/60">{artist}</p>
        </div>

        {/* Economics */}
        <div className="flex items-center justify-between text-sm">
          <span className="font-bold text-brand-400">
            {formatPrice(licensePrice)} / license
          </span>
          <span className="text-white/50">
            {revenueSharePct}% rev share
          </span>
        </div>

        {/* Availability bar */}
        <div>
          <div className="mb-1 flex justify-between text-xs text-white/50">
            <span>{remaining} of {totalLicenses} available</span>
            <span>{remainingPct}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-500 transition-all"
              style={{ width: `${remainingPct}%` }}
            />
          </div>
        </div>

        <button className="mt-auto w-full rounded-xl bg-brand-500 py-2 text-sm font-semibold text-white hover:bg-brand-600 transition">
          View &amp; License
        </button>
      </div>
    </a>
  );
}
