"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";

interface AuctionSong {
  id: string;
  title: string;
  artist: string;
  coverUrl: string | null;
  genre: string | null;
}

interface AuctionSeller {
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
}

interface Auction {
  id: string;
  startingBid: number;
  currentBid: number | null;
  status: string;
  endsAt: string;
  song: AuctionSong;
  seller: AuctionSeller;
  _count: { bids: number };
}

function timeLeft(endsAt: string) {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return "Ended";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

function urgencyColor(endsAt: string) {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff < 3600000) return "text-red-400";
  if (diff < 86400000) return "text-amber-400";
  return "text-green-400";
}

export default function AuctionsPage() {
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [, forceUpdate] = useState(0);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/auctions?page=${p}`);
      if (res.ok) {
        const data = await res.json();
        setAuctions(data.auctions ?? []);
        setTotalPages(data.pages ?? 1);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(page);
    const interval = setInterval(() => load(page), 30_000);
    return () => clearInterval(interval);
  }, [load, page]);

  // Tick every second to keep countdown timers current
  useEffect(() => {
    const t = setInterval(() => forceUpdate((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="studio-room relative min-h-screen">
      <div className="relative z-[1] mx-auto max-w-5xl px-4 py-12">
      <div className="mb-10">
        <div className="flex items-center gap-3">
          <span aria-hidden className="led-on-rec h-2.5 w-2.5 rounded-full animate-pulse" />
          <span className="studio-label text-rec-400">On Air · Bid Booth</span>
          <span className="studio-label ml-auto text-white/35">BR-01 · Live</span>
        </div>
        <h1 className="font-display mt-3 text-4xl uppercase tracking-wider text-white sm:text-5xl">
          Live Auctions
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/60">
          Bid on exclusive music licenses — the winner gets the license and
          earns revenue share on every future sale.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-72 animate-pulse rounded-xl studio-faceplate-dark"
            />
          ))}
        </div>
      ) : auctions.length === 0 ? (
        <div className="studio-faceplate relative rounded-xl px-6 py-16 text-center sm:py-24">
          <span aria-hidden className="studio-screw absolute left-3 top-3" />
          <span aria-hidden className="studio-screw absolute right-3 top-3" />
          <span aria-hidden className="studio-screw absolute left-3 bottom-3" />
          <span aria-hidden className="studio-screw absolute right-3 bottom-3" />
          <p className="studio-label text-tube-300">No Signal</p>
          <p className="mt-3 font-display text-2xl uppercase tracking-wide text-white">
            No active auctions right now
          </p>
          <p className="mt-2 text-sm text-white/55">
            Check back soon, or list your own track if you&apos;re an artist.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {auctions.map((auction) => {
            const currentBid = auction.currentBid ?? auction.startingBid;
            return (
              <Link
                key={auction.id}
                href={`/auctions/${auction.id}`}
                className="studio-faceplate group relative flex flex-col overflow-hidden rounded-xl"
              >
                <span aria-hidden className="studio-screw absolute left-2 top-2 z-10" />
                <span aria-hidden className="studio-screw absolute right-2 top-2 z-10" />

                <div className="relative h-44 w-full overflow-hidden studio-faceplate-dark">
                  {auction.song.coverUrl ? (
                    <Image
                      src={auction.song.coverUrl}
                      alt={auction.song.title}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-5xl">🎵</div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                  <div className="absolute bottom-3 left-3 right-3">
                    <p className="font-display text-base uppercase leading-tight tracking-wide text-white">
                      {auction.song.title}
                    </p>
                    <p className="mt-0.5 text-xs text-white/65">
                      {auction.song.artist}
                    </p>
                  </div>
                  {auction.song.genre && (
                    <span className="absolute top-3 right-3 rounded-md studio-faceplate-dark px-2 py-1 studio-label text-white/70">
                      {auction.song.genre}
                    </span>
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-3 p-4 pt-3">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="studio-label text-white/45">Current Bid</p>
                      <div className="studio-screen mt-1 inline-block rounded-md px-3 py-1.5">
                        <span className="text-readout-amber relative z-10 text-xl font-bold tabular-nums">
                          ${Number(currentBid).toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="studio-label text-white/45">Bids</p>
                      <p className="text-readout-cyan mt-1 text-lg font-bold tabular-nums">
                        {auction._count.bids}
                      </p>
                    </div>
                  </div>

                  <div className="mt-auto flex items-center justify-between border-t border-white/[0.06] pt-3">
                    <p className={`studio-label ${urgencyColor(auction.endsAt)}`}>
                      ◉ {timeLeft(auction.endsAt)}
                    </p>
                    <span className="rounded-md studio-faceplate-dark px-3 py-1.5 studio-label text-tube-300 group-hover:text-tube-200">
                      Bid now →
                    </span>
                  </div>
                </div>

                <span aria-hidden className="studio-screw absolute left-2 bottom-2" />
                <span aria-hidden className="studio-screw absolute right-2 bottom-2" />
              </Link>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-10 flex justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-md studio-faceplate-dark px-4 py-2 studio-label text-white/75 transition hover:text-white disabled:opacity-30"
          >
            Previous
          </button>
          <span className="rounded-md studio-faceplate-dark px-4 py-2 studio-label text-tube-300">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-md studio-faceplate-dark px-4 py-2 studio-label text-white/75 transition hover:text-white disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
      </div>
    </div>
  );
}
