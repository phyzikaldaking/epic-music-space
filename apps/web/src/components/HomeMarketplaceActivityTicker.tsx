"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type TickerSong = {
  id: string;
  title: string;
  artist: string;
  soldLicenses: number;
  totalLicenses: number;
  licensePrice: string;
};

type Props = {
  songs: TickerSong[];
  licenseCount: number;
  totalRevenue: number;
};

function money(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export default function HomeMarketplaceActivityTicker({ songs, licenseCount, totalRevenue }: Props) {
  const [liveSongs, setLiveSongs] = useState<TickerSong[]>(songs);
  const [liveLicenseCount, setLiveLicenseCount] = useState(licenseCount);

  useEffect(() => {
    setLiveSongs(songs);
    setLiveLicenseCount(licenseCount);
  }, [songs, licenseCount]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/market/listings", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json().catch(() => null)) as
          | Array<{ id: string; title: string; artist: string; soldLicenses: number; totalLicenses: number; licensePrice: number }>
          | null;
        if (!data || cancelled) return;
        const mapped: TickerSong[] = data.slice(0, 8).map((row) => ({
          id: row.id,
          title: row.title,
          artist: row.artist,
          soldLicenses: Number(row.soldLicenses ?? 0),
          totalLicenses: Number(row.totalLicenses ?? 0),
          licensePrice: String(row.licensePrice ?? ""),
        }));
        const totalActive = data.reduce((acc, row) => acc + Number(row.soldLicenses ?? 0), 0);
        setLiveSongs(mapped.length > 0 ? mapped : songs);
        setLiveLicenseCount((prev) => Math.max(prev, totalActive));
      } catch {
        // ignore network errors
      }
    }

    const id = window.setInterval(() => void poll(), 15_000);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [songs]);

  const items = useMemo(() => liveSongs.slice(0, 8).map((song) => {
    const remaining = Math.max(0, song.totalLicenses - song.soldLicenses);
    return `${song.title} by ${song.artist} · ${song.soldLicenses}/${song.totalLicenses} claimed · ${remaining} left`;
  }), [liveSongs]);

  const feed = [
    `${liveLicenseCount.toLocaleString()} licenses active`,
    `${money(totalRevenue)} tracked through successful license purchases`,
    ...items,
  ];

  if (feed.length === 0) return null;

  return (
    <div className="mt-6 overflow-hidden rounded-md border border-white/10 bg-black/40">
      <div className="flex items-center gap-3 border-b border-white/8 px-3 py-2">
        <span aria-hidden className="led-on-green h-1.5 w-1.5 rounded-full" />
        <p className="studio-label text-white/55">Marketplace Activity</p>
        <Link href="/marketplace" className="studio-label ml-auto text-tube-300 hover:text-tube-200">
          View floor →
        </Link>
      </div>
      <div className="studio-ticker-track py-3" aria-label="Marketplace activity ticker">
        {[...feed, ...feed].map((item, index) => (
          <span key={`${item}-${index}`}>
            {item}
            <span className="dot">◆</span>
          </span>
        ))}
      </div>
    </div>
  );
}
