"use client";

import { Suspense } from "react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Music, DollarSign, TrendingUp, Users, Upload, ExternalLink, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Song, Transaction } from "@/types/database";

interface DashboardStats {
  totalSongs: number;
  totalPlays: number;
  totalEarnings: number;
  totalFollowers: number;
}

function DashboardContent() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const stripeSuccess = searchParams.get("success");

  const [songs, setSongs] = useState<Song[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalSongs: 0,
    totalPlays: 0,
    totalEarnings: 0,
    totalFollowers: 0,
  });
  const [stripeStatus, setStripeStatus] = useState<{
    onboarded: boolean;
    hasAccount: boolean;
    loading: boolean;
  }>({ onboarded: false, hasAccount: false, loading: true });
  const [connectingStripe, setConnectingStripe] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const supabase = createClient();

    const fetchData = async () => {
      const [songsRes, txRes] = await Promise.all([
        supabase.from("songs").select("*").eq("artist_id", user.id).order("created_at", { ascending: false }),
        supabase.from("transactions").select("*").eq("to_user_id", user.id).order("created_at", { ascending: false }).limit(20),
      ]);

      const songList = songsRes.data ?? [];
      const txList = txRes.data ?? [];

      setSongs(songList);
      setTransactions(txList);

      const totalEarnings = txList.reduce((sum, tx) => sum + (tx.net_amount ?? 0), 0);

      setStats({
        totalSongs: songList.length,
        totalPlays: songList.reduce((sum, s) => sum + (s.plays_count ?? 0), 0),
        totalEarnings,
        totalFollowers: profile?.followers_count ?? 0,
      });

      setLoading(false);
    };

    const fetchStripeStatus = async () => {
      const res = await fetch("/api/stripe/connect");
      const data = await res.json();
      setStripeStatus({ ...data, loading: false });
    };

    fetchData();
    fetchStripeStatus();
  }, [user, profile]);

  const connectStripe = async () => {
    setConnectingStripe(true);
    const res = await fetch("/api/stripe/connect", { method: "POST" });
    const { url, error } = await res.json();
    if (error) {
      alert(error);
      setConnectingStripe(false);
      return;
    }
    window.location.href = url;
  };

  if (!user) {
    router.push("/login?redirect=/dashboard");
    return null;
  }

  const statCards = [
    { label: "Songs", value: stats.totalSongs, icon: Music, color: "text-purple-400" },
    { label: "Total Plays", value: stats.totalPlays.toLocaleString(), icon: TrendingUp, color: "text-blue-400" },
    { label: "Earnings", value: `$${stats.totalEarnings.toFixed(2)}`, icon: DollarSign, color: "text-green-400" },
    { label: "Followers", value: stats.totalFollowers.toLocaleString(), icon: Users, color: "text-pink-400" },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Artist Dashboard</h1>
          <p className="text-gray-400 text-sm mt-0.5">Welcome back, {profile?.display_name ?? profile?.username}</p>
        </div>
        <Link
          href="/upload"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-500 transition-colors text-sm"
        >
          <Upload size={16} />
          Upload Song
        </Link>
      </div>

      {/* Stripe Connect Banner */}
      {!stripeStatus.loading && !stripeStatus.onboarded && (
        <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-5 flex items-start gap-4">
          <AlertCircle size={22} className="text-yellow-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-white font-semibold">Set up payouts to start earning</h3>
            <p className="text-gray-400 text-sm mt-1">
              Connect your Stripe account to receive payments directly when fans buy your music.
              EMS takes a 15% platform fee.
            </p>
          </div>
          <button
            onClick={connectStripe}
            disabled={connectingStripe}
            className="shrink-0 px-4 py-2 rounded-xl bg-yellow-500 text-black font-semibold text-sm hover:bg-yellow-400 transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {connectingStripe ? <Loader2 size={14} className="animate-spin" /> : null}
            Connect Stripe
          </button>
        </div>
      )}

      {stripeSuccess && stripeStatus.onboarded && (
        <div className="rounded-2xl border border-green-500/30 bg-green-500/5 p-4 flex items-center gap-3">
          <CheckCircle size={20} className="text-green-400" />
          <p className="text-green-300 text-sm">Stripe account connected successfully! You can now receive payouts.</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <Icon size={24} className={color} />
            <p className="text-2xl font-bold text-white mt-3">{value}</p>
            <p className="text-gray-400 text-sm mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Songs table */}
      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Your Songs</h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : songs.length === 0 ? (
          <div className="text-center py-12">
            <Music size={40} className="text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">No songs uploaded yet</p>
            <Link href="/upload" className="text-purple-400 text-sm hover:underline mt-2 block">
              Upload your first track
            </Link>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3 text-left">Song</th>
                <th className="px-6 py-3 text-right">Plays</th>
                <th className="px-6 py-3 text-right">Likes</th>
                <th className="px-6 py-3 text-right">Sale type</th>
                <th className="px-6 py-3 text-right">Price</th>
                <th className="px-6 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {songs.map((song) => (
                <tr key={song.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4">
                    <p className="text-white font-medium text-sm truncate max-w-[200px]">{song.title}</p>
                    {song.genre && <p className="text-gray-500 text-xs">{song.genre}</p>}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-400 text-sm">{song.plays_count?.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right text-gray-400 text-sm">{song.likes_count}</td>
                  <td className="px-6 py-4 text-right">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${
                      song.sale_type === "free" ? "bg-gray-600/30 text-gray-300" :
                      song.sale_type === "fixed" ? "bg-green-600/20 text-green-300" :
                      song.sale_type === "pwyw" ? "bg-blue-600/20 text-blue-300" :
                      "bg-orange-600/20 text-orange-300"
                    }`}>
                      {song.sale_type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-gray-400 text-sm">
                    {song.price ? `$${song.price.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link href={`/song/${song.id}`} className="text-gray-500 hover:text-gray-300 transition-colors">
                      <ExternalLink size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Recent transactions */}
      {transactions.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10">
            <h2 className="text-lg font-semibold text-white">Recent Earnings</h2>
          </div>
          <div className="divide-y divide-white/5">
            {transactions.slice(0, 10).map((tx) => (
              <div key={tx.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="text-white text-sm capitalize">{tx.type}</p>
                  <p className="text-gray-500 text-xs">{new Date(tx.created_at).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-green-400 font-semibold">${(tx.net_amount ?? tx.amount).toFixed(2)}</p>
                  <p className="text-gray-600 text-xs">fee: ${tx.platform_fee?.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <DashboardContent />
    </Suspense>
  );
}
