"use client";

import { useState, useEffect, useCallback, use } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";

interface Bid {
  id: string;
  amount: number;
  createdAt: string;
  bidder: { id: string; name: string | null; username: string | null; image: string | null };
}

interface AuctionDetail {
  id: string;
  startingBid: number;
  reservePrice: number | null;
  currentBid: number | null;
  status: string;
  endsAt: string;
  createdAt: string;
  song: {
    id: string;
    title: string;
    artist: string;
    coverUrl: string | null;
    genre: string | null;
    description: string | null;
    audioUrl: string;
    revenueSharePct: number;
  };
  seller: { id: string; name: string | null; username: string | null; image: string | null };
  winner: { id: string; name: string | null; username: string | null } | null;
  bids: Bid[];
  _count: { bids: number };
}

function timeLeft(endsAt: string) {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return "Ended";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AuctionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session } = useSession();
  const [auction, setAuction] = useState<AuctionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [bidAmount, setBidAmount] = useState("");
  const [bidding, setBidding] = useState(false);
  const [bidError, setBidError] = useState("");
  const [bidSuccess, setBidSuccess] = useState(false);
  const [, forceUpdate] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/auctions/${id}`);
      if (res.ok) setAuction(await res.json());
    } catch {}
  }, [id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
    const poll = setInterval(load, 15_000);
    return () => clearInterval(poll);
  }, [load]);

  // Tick every second to keep the countdown current
  useEffect(() => {
    const t = setInterval(() => forceUpdate((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  async function placeBid() {
    if (!session) return;
    setBidError("");
    setBidSuccess(false);
    const amount = parseFloat(bidAmount);
    if (isNaN(amount) || amount <= 0) {
      setBidError("Enter a valid bid amount.");
      return;
    }
    setBidding(true);
    try {
      const res = await fetch(`/api/auctions/${id}/bid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBidError(data.error ?? "Failed to place bid.");
      } else {
        setBidSuccess(true);
        setBidAmount("");
        await load();
      }
    } finally {
      setBidding(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="h-96 rounded-3xl bg-white/5 animate-pulse" />
      </div>
    );
  }
  if (!auction) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-24 text-center text-white/40">
        <p className="text-5xl mb-4">🔍</p>
        <p className="text-xl font-semibold">Auction not found</p>
        <Link href="/auctions" className="mt-4 inline-block text-brand-400 hover:underline">
          Back to auctions
        </Link>
      </div>
    );
  }

  const isActive = auction.status === "ACTIVE" && new Date(auction.endsAt) > new Date();
  const minBid = auction.currentBid
    ? (Number(auction.currentBid) + 0.01).toFixed(2)
    : Number(auction.startingBid).toFixed(2);
  const isSeller = session?.user?.id === auction.seller.id;
  const currentBid = auction.currentBid ?? auction.startingBid;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <Link
        href="/auctions"
        className="mb-8 inline-flex items-center gap-2 text-sm text-white/40 hover:text-white transition"
      >
        ← All auctions
      </Link>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        {/* Left: Song info */}
        <div className="space-y-6">
          <div className="relative aspect-square w-full max-w-sm overflow-hidden rounded-3xl bg-white/5">
            {auction.song.coverUrl ? (
              <Image
                src={auction.song.coverUrl}
                alt={auction.song.title}
                fill
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-7xl">🎵</div>
            )}
            {auction.song.genre && (
              <span className="absolute top-4 right-4 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white/80 backdrop-blur">
                {auction.song.genre}
              </span>
            )}
          </div>

          <div>
            <h1 className="text-3xl font-extrabold">{auction.song.title}</h1>
            <p className="mt-1 text-lg text-white/60">{auction.song.artist}</p>
            {auction.song.description && (
              <p className="mt-4 text-sm text-white/[0.45] leading-relaxed">
                {auction.song.description}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Revenue share</p>
            <p className="text-2xl font-extrabold text-brand-400">
              {Number(auction.song.revenueSharePct)}%
            </p>
            <p className="mt-1 text-xs text-white/40">
              The winner earns this % of every future license sale of this track.
            </p>
          </div>

          {auction.bids.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-bold text-white/60 uppercase tracking-wider">
                Bid history
              </h2>
              <ul className="space-y-2">
                {auction.bids.map((bid, i) => (
                  <li
                    key={bid.id}
                    className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5"
                  >
                    <div className="flex items-center gap-3">
                      {bid.bidder.image ? (
                        <Image
                          src={bid.bidder.image}
                          alt=""
                          width={28}
                          height={28}
                          className="rounded-full"
                        />
                      ) : (
                        <div className="h-7 w-7 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold">
                          {(bid.bidder.name ?? bid.bidder.username ?? "?")[0]?.toUpperCase()}
                        </div>
                      )}
                      <span className="text-sm text-white/80">
                        {bid.bidder.name ?? bid.bidder.username ?? "Anonymous"}
                        {i === 0 && (
                          <span className="ml-2 rounded-full bg-brand-500/20 px-2 py-0.5 text-[10px] font-bold text-brand-400">
                            Leading
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">${Number(bid.amount).toFixed(2)}</p>
                      <p className="text-[10px] text-white/30">{timeAgo(bid.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right: Bid panel */}
        <div className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <div className="mb-4 flex items-center justify-between">
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  isActive
                    ? "bg-green-500/15 text-green-400"
                    : auction.status === "SETTLED"
                      ? "bg-brand-500/15 text-brand-400"
                      : "bg-white/10 text-white/40"
                }`}
              >
                {isActive
                  ? "Active"
                  : auction.status.charAt(0) + auction.status.slice(1).toLowerCase()}
              </span>
              {isActive && (
                <span className="text-sm font-mono font-bold text-amber-400">
                  {timeLeft(auction.endsAt)}
                </span>
              )}
            </div>

            <div className="mb-6">
              <p className="text-xs text-white/40 uppercase tracking-wider">Current bid</p>
              <p className="text-4xl font-extrabold text-brand-400">
                ${Number(currentBid).toFixed(2)}
              </p>
              <p className="mt-1 text-xs text-white/40">
                Starting bid: ${Number(auction.startingBid).toFixed(2)} · {auction._count.bids}{" "}
                bids
              </p>
            </div>

            <div className="mb-6 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              {auction.seller.image ? (
                <Image
                  src={auction.seller.image}
                  alt=""
                  width={32}
                  height={32}
                  className="rounded-full"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center text-sm font-bold">
                  {(auction.seller.name ?? auction.seller.username ?? "?")[0]?.toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-[10px] text-white/40">Seller</p>
                <p className="text-sm font-semibold">
                  {auction.seller.name ?? auction.seller.username ?? "Artist"}
                </p>
              </div>
            </div>

            {isActive && !isSeller && (
              <div className="space-y-3">
                {!session ? (
                  <Link
                    href="/auth/signin"
                    className="block w-full rounded-xl bg-brand-500 py-3 text-center text-sm font-bold text-white hover:bg-brand-600 transition"
                  >
                    Sign in to bid
                  </Link>
                ) : (
                  <>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 font-bold">
                        $
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min={minBid}
                        value={bidAmount}
                        onChange={(e) => {
                          setBidAmount(e.target.value);
                          setBidError("");
                          setBidSuccess(false);
                        }}
                        placeholder={minBid}
                        className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-8 pr-4 text-sm font-semibold focus:border-brand-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
                      />
                    </div>
                    {bidError && <p className="text-xs text-red-400">{bidError}</p>}
                    {bidSuccess && (
                      <p className="text-xs text-green-400">Bid placed successfully!</p>
                    )}
                    <button
                      onClick={placeBid}
                      disabled={bidding || !bidAmount}
                      className="w-full rounded-xl bg-brand-500 py-3 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-40 transition"
                    >
                      {bidding ? "Placing bid..." : `Place bid — $${bidAmount || minBid}`}
                    </button>
                    <p className="text-[10px] text-white/30 text-center">
                      Minimum bid: ${minBid}. If you win, you will be sent a payment link.
                    </p>
                  </>
                )}
              </div>
            )}

            {isSeller && isActive && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center text-xs text-white/40">
                This is your auction. You cannot bid on your own listing.
              </div>
            )}

            {auction.status === "ENDED" && auction.winner && (
              <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 p-4 text-center">
                <p className="text-sm font-bold">Auction ended</p>
                <p className="mt-1 text-xs text-white/50">
                  Winner: {auction.winner.name ?? auction.winner.username ?? "Anonymous"} —
                  awaiting payment
                </p>
              </div>
            )}

            {auction.status === "SETTLED" && (
              <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 text-center">
                <p className="text-sm font-bold text-green-400">Settled</p>
                <p className="mt-1 text-xs text-white/50">License transferred to winner.</p>
              </div>
            )}

            {(auction.status === "EXPIRED" || auction.status === "CANCELLED") && (
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-center">
                <p className="text-sm font-semibold text-white/50">
                  {auction.status === "EXPIRED" ? "Ended — no winner" : "Cancelled by seller"}
                </p>
              </div>
            )}
          </div>

          <Link
            href={`/songs/${auction.song.id}`}
            className="block rounded-2xl border border-white/[0.08] bg-white/[0.02] px-5 py-4 text-sm text-white/60 hover:bg-white/5 hover:text-white transition text-center"
          >
            View song page →
          </Link>
        </div>
      </div>
    </div>
  );
}
