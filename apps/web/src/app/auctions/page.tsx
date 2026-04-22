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
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-10">
        <h1 className="text-4xl font-extrabold">Live Auctions</h1>
        <p className="mt-2 text-white/50">
          Bid on exclusive music licenses — winner gets the license and earns revenue share on every
          future sale.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-64 rounded-2xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : auctions.length === 0 ? (
        <div className="py-24 text-center text-white/30">
          <p className="text-5xl mb-4">🎵</p>
          <p className="text-xl font-semibold">No active auctions right now</p>
          <p className="mt-2 text-sm">Check back soon, or list your own if you are an artist.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {auctions.map((auction) => {
            const currentBid = auction.currentBid ?? auction.startingBid;
            return (
              <Link
                key={auction.id}
                href={`/auctions/${auction.id}`}
                className="group flex flex-col rounded-2xl border border-white/[0.08] bg-white/[0.03] overflow-hidden hover:border-brand-500/40 hover:bg-white/[0.06] transition-all"
              >
                <div className="relative h-44 w-full bg-white/5 overflow-hidden">
                  {auction.song.coverUrl ? (
                    <Image
                      src={auction.song.coverUrl}
                      alt={auction.song.title}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-5xl">🎵</div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                  <div className="absolute bottom-3 left-3 right-3">
                    <p className="text-sm font-bold truncate">{auction.song.title}</p>
                    <p className="text-xs text-white/60 truncate">{auction.song.artist}</p>
                  </div>
                  {auction.song.genre && (
                    <span className="absolute top-3 right-3 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold text-white/70 backdrop-blur">
                      {auction.song.genre}
                    </span>
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-white/40 uppercase tracking-wider">
                        Current bid
                      </p>
                      <p className="text-xl font-extrabold text-brand-400">
                        ${Number(currentBid).toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-white/40 uppercase tracking-wider">Bids</p>
                      <p className="text-lg font-bold">{auction._count.bids}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-auto pt-3 border-t border-white/[0.06]">
                    <p className={`text-xs font-semibold ${urgencyColor(auction.endsAt)}`}>
                      {timeLeft(auction.endsAt)}
                    </p>
                    <span className="rounded-lg bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-400 group-hover:bg-brand-500/20 transition">
                      Bid now →
                    </span>
                  </div>
                </div>
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
            className="rounded-lg border border-white/10 px-4 py-2 text-sm disabled:opacity-30 hover:bg-white/[0.06] transition"
          >
            Previous
          </button>
          <span className="rounded-lg border border-white/10 px-4 py-2 text-sm">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm disabled:opacity-30 hover:bg-white/[0.06] transition"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
