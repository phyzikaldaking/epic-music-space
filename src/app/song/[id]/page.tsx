"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Play, Pause, Heart, MessageCircle, Share2, DollarSign, Gavel, TrendingUp, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SongWithArtist, CommentWithUser, BidWithBidder } from "@/types/database";
import { usePlayerStore } from "@/store/playerStore";
import { useLike } from "@/hooks/useLike";
import { useFollow } from "@/hooks/useFollow";
import { useAuth } from "@/hooks/useAuth";
import { songToTrack } from "@/components/feed/SongCard";
import { cn } from "@/lib/utils";

export default function SongPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { currentTrack, isPlaying, playTrack, togglePlay } = usePlayerStore();

  const [song, setSong] = useState<SongWithArtist | null>(null);
  const [comments, setComments] = useState<CommentWithUser[]>([]);
  const [bids, setBids] = useState<BidWithBidder[]>([]);
  const [newComment, setNewComment] = useState("");
  const [bidAmount, setBidAmount] = useState("");
  const [pwywAmount, setPwywAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [submittingBid, setSubmittingBid] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  const { liked, count: likeCount, toggle: toggleLike } = useLike(id, song?.likes_count ?? 0);
  const { following, toggle: toggleFollow } = useFollow(
    song?.artist_id ?? "",
    song?.profiles?.followers_count ?? 0
  );

  useEffect(() => {
    const supabase = createClient();

    const fetchAll = async () => {
      // Use explicit type assertions for joined queries — Supabase SDK v2 join types
      // require Relationships defined in schema which we handle at runtime
      const [songRes, commentsRes, bidsRes] = await Promise.all([
        supabase.from("songs").select("*, profiles(*)").eq("id", id).single() as unknown as Promise<{ data: SongWithArtist | null; error: unknown }>,
        supabase.from("comments").select("*, profiles(*)").eq("song_id", id).order("created_at", { ascending: false }) as unknown as Promise<{ data: CommentWithUser[] | null; error: unknown }>,
        supabase.from("bids").select("*, profiles(*)").eq("song_id", id).eq("status", "active").order("amount", { ascending: false }) as unknown as Promise<{ data: BidWithBidder[] | null; error: unknown }>,
      ]);

      if (songRes.data) setSong(songRes.data);
      if (commentsRes.data) setComments(commentsRes.data);
      if (bidsRes.data) setBids(bidsRes.data);
      setLoading(false);

      // Track play
      if (songRes.data) {
        await supabase.from("songs").update({ plays_count: (songRes.data.plays_count ?? 0) + 1 }).eq("id", id);
      }
    };

    fetchAll();
  }, [id]);

  const handlePlay = () => {
    if (!song) return;
    const track = songToTrack(song);
    if (currentTrack?.id === song.id) togglePlay();
    else playTrack(track, [track]);
  };

  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newComment.trim() || submittingComment) return;
    setSubmittingComment(true);
    const supabase = createClient();
    const { data } = await (supabase
      .from("comments")
      .insert({ song_id: id, user_id: user.id, body: newComment.trim() })
      .select("*, profiles(*)")
      .single() as unknown as Promise<{ data: CommentWithUser | null; error: unknown }>);

    if (data) {
      setComments((prev) => [data, ...prev]);
      setNewComment("");
    }
    setSubmittingComment(false);
  };

  const submitBid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !bidAmount || submittingBid) return;
    setSubmittingBid(true);
    const supabase = createClient();
    const amount = parseFloat(bidAmount);
    const topBid = bids[0]?.amount ?? 0;
    if (amount <= topBid) {
      alert(`Bid must be higher than current top bid ($${topBid.toFixed(2)})`);
      setSubmittingBid(false);
      return;
    }
    const { data } = await (supabase
      .from("bids")
      .insert({ song_id: id, bidder_id: user.id, amount })
      .select("*, profiles(*)")
      .single() as unknown as Promise<{ data: BidWithBidder | null; error: unknown }>);

    if (data) {
      setBids((prev) => [data, ...prev]);
      setBidAmount("");
    }
    setSubmittingBid(false);
  };

  const startCheckout = async (type: "fixed" | "pwyw") => {
    if (!user) {
      window.location.href = `/login?redirect=/song/${id}`;
      return;
    }
    setCheckingOut(true);
    const amount = type === "pwyw" ? parseFloat(pwywAmount) : undefined;

    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songId: id, type, amount }),
    });

    const { url, error } = await res.json();
    if (error) {
      alert(error);
      setCheckingOut(false);
      return;
    }
    window.location.href = url;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!song) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400">Song not found</p>
      </div>
    );
  }

  const isActive = currentTrack?.id === song.id;
  const topBid = bids[0]?.amount ?? 0;

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Hero */}
      <div className="flex flex-col sm:flex-row gap-8 mb-8">
        {/* Cover */}
        <div className="relative w-full sm:w-56 h-56 rounded-2xl overflow-hidden shrink-0 shadow-2xl shadow-purple-900/40">
          <Image
            src={song.cover_url ?? `https://picsum.photos/seed/${song.id}/400/400`}
            alt={song.title}
            fill
            className="object-cover"
            unoptimized
          />
          <button
            onClick={handlePlay}
            className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/50 transition-colors"
            aria-label={isActive && isPlaying ? "Pause" : "Play"}
          >
            <div className="w-14 h-14 rounded-full bg-purple-600 flex items-center justify-center shadow-xl">
              {isActive && isPlaying ? (
                <Pause size={24} className="text-white" />
              ) : (
                <Play size={24} className="text-white ml-0.5" fill="white" />
              )}
            </div>
          </button>
        </div>

        {/* Info */}
        <div className="flex-1 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-white">{song.title}</h1>
                <Link href={`/${song.profiles?.username}`} className="text-purple-400 hover:text-purple-300 mt-1 block">
                  {song.profiles?.display_name ?? song.profiles?.username}
                </Link>
              </div>
              {user && user.id !== song.artist_id && (
                <button
                  onClick={toggleFollow}
                  className={cn(
                    "shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold border transition-all",
                    following
                      ? "bg-white/10 border-white/20 text-white hover:bg-red-500/20 hover:border-red-500/40 hover:text-red-300"
                      : "bg-purple-600 border-purple-500 text-white hover:bg-purple-500"
                  )}
                >
                  {following ? "Following" : "Follow"}
                </button>
              )}
            </div>

            {song.description && (
              <p className="text-gray-400 text-sm mt-3 line-clamp-3">{song.description}</p>
            )}

            <div className="flex flex-wrap gap-2 mt-3">
              {song.genre && (
                <span className="px-3 py-1 rounded-full bg-purple-600/20 border border-purple-500/30 text-purple-300 text-xs">
                  {song.genre}
                </span>
              )}
              {song.allows_resale && (
                <span className="px-3 py-1 rounded-full bg-green-600/20 border border-green-500/30 text-green-300 text-xs flex items-center gap-1">
                  <TrendingUp size={11} /> Resale allowed
                </span>
              )}
              {song.allows_investment && (
                <span className="px-3 py-1 rounded-full bg-blue-600/20 border border-blue-500/30 text-blue-300 text-xs flex items-center gap-1">
                  <Users size={11} /> Investment available
                </span>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-5 mt-4">
            <span className="text-gray-400 text-sm">{song.plays_count?.toLocaleString()} plays</span>
            <button
              onClick={toggleLike}
              disabled={!user}
              className={cn(
                "flex items-center gap-1.5 text-sm transition-colors",
                liked ? "text-pink-400" : "text-gray-500 hover:text-pink-400"
              )}
            >
              <Heart size={16} fill={liked ? "currentColor" : "none"} />
              {likeCount}
            </button>
            <span className="flex items-center gap-1.5 text-sm text-gray-500">
              <MessageCircle size={16} />
              {comments.length}
            </span>
            <button
              onClick={() => navigator.clipboard.writeText(window.location.href)}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              <Share2 size={16} />
              Share
            </button>
          </div>
        </div>
      </div>

      {/* Purchase / Bid / Investment section */}
      {song.sale_type !== "free" && (
        <div id="buy" className="rounded-2xl border border-white/10 bg-white/5 p-6 mb-8">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <DollarSign size={20} className="text-green-400" />
            {song.sale_type === "fixed" && "Buy this track"}
            {song.sale_type === "pwyw" && "Pay what you want"}
            {song.sale_type === "auction" && "Place a bid"}
          </h2>

          {song.sale_type === "fixed" && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold text-white">${song.price?.toFixed(2)}</p>
                <p className="text-gray-400 text-sm mt-0.5">One-time purchase · Exclusive ownership</p>
              </div>
              <button
                onClick={() => startCheckout("fixed")}
                disabled={checkingOut}
                className="px-6 py-3 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-500 transition-colors disabled:opacity-50"
              >
                {checkingOut ? "Redirecting…" : "Buy now"}
              </button>
            </div>
          )}

          {song.sale_type === "pwyw" && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-1">
                <p className="text-gray-400 text-sm mb-2">Set your price (min ${song.min_price?.toFixed(2)})</p>
                <div className="flex gap-2">
                  {[1, 5, 10, 25, 50].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setPwywAmount(String(v))}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-sm border transition-all",
                        pwywAmount === String(v)
                          ? "bg-purple-600 border-purple-500 text-white"
                          : "bg-white/5 border-white/10 text-gray-400 hover:border-white/30"
                      )}
                    >
                      ${v}
                    </button>
                  ))}
                  <input
                    type="number"
                    value={pwywAmount}
                    onChange={(e) => setPwywAmount(e.target.value)}
                    placeholder="Custom"
                    min={song.min_price ?? 1}
                    className="w-24 px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-sm focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>
              <button
                onClick={() => startCheckout("pwyw")}
                disabled={checkingOut || !pwywAmount}
                className="px-6 py-3 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-500 transition-colors disabled:opacity-50"
              >
                {checkingOut ? "Redirecting…" : `Pay $${pwywAmount || "?"}`}
              </button>
            </div>
          )}

          {song.sale_type === "auction" && (
            <div>
              <div className="flex items-center gap-6 mb-4">
                <div>
                  <p className="text-xs text-gray-500">Current top bid</p>
                  <p className="text-2xl font-bold text-white">{topBid > 0 ? `$${topBid.toFixed(2)}` : "No bids yet"}</p>
                </div>
                {song.auction_end && (
                  <div>
                    <p className="text-xs text-gray-500">Ends</p>
                    <p className="text-sm text-white">{new Date(song.auction_end).toLocaleString()}</p>
                  </div>
                )}
              </div>

              <form onSubmit={submitBid} className="flex gap-3">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <input
                    type="number"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    min={(topBid + 0.01).toFixed(2)}
                    step="0.01"
                    placeholder={`${(topBid + 1).toFixed(2)}`}
                    className="w-full pl-7 pr-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submittingBid || !bidAmount}
                  className="px-6 py-3 rounded-xl bg-orange-600 text-white font-semibold hover:bg-orange-500 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <Gavel size={16} />
                  Bid
                </button>
              </form>

              {/* Bid history */}
              {bids.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Recent bids</p>
                  {bids.slice(0, 5).map((bid, i) => (
                    <div key={bid.id} className="flex items-center justify-between text-sm">
                      <span className={cn("font-medium", i === 0 ? "text-orange-400" : "text-gray-400")}>
                        {bid.profiles?.display_name ?? bid.profiles?.username}
                      </span>
                      <span className={cn("font-bold", i === 0 ? "text-white" : "text-gray-400")}>
                        ${bid.amount.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Comments */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Comments</h2>

        {user && (
          <form onSubmit={submitComment} className="flex gap-3 mb-6">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment…"
              maxLength={500}
              className="flex-1 px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
            />
            <button
              type="submit"
              disabled={submittingComment || !newComment.trim()}
              className="px-4 py-2.5 rounded-xl bg-purple-600 text-white font-medium hover:bg-purple-500 transition-colors disabled:opacity-50"
            >
              Post
            </button>
          </form>
        )}

        {comments.length === 0 ? (
          <p className="text-center text-gray-500 text-sm py-8">No comments yet. Be the first!</p>
        ) : (
          <div className="space-y-4">
            {comments.map((comment) => (
              <div key={comment.id} className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-purple-600/30 flex items-center justify-center shrink-0 text-sm font-bold text-purple-300">
                  {(comment.profiles?.display_name ?? comment.profiles?.username ?? "?")[0].toUpperCase()}
                </div>
                <div>
                  <div className="flex items-baseline gap-2">
                    <Link href={`/${comment.profiles?.username}`} className="text-sm font-medium text-white hover:text-purple-300">
                      {comment.profiles?.display_name ?? comment.profiles?.username}
                    </Link>
                    <span className="text-xs text-gray-600">
                      {new Date(comment.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300 mt-0.5">{comment.body}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
