"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { DollarSign, Gavel, TrendingUp, Filter } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SongWithArtist } from "@/types/database";
import { cn } from "@/lib/utils";

type Filter = "all" | "fixed" | "pwyw" | "auction";

export default function MarketplacePage() {
  const [songs, setSongs] = useState<SongWithArtist[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let query = supabase
      .from("songs")
      .select("*, profiles(*)")
      .eq("is_published", true)
      .neq("sale_type", "free")
      .order("created_at", { ascending: false });

    if (filter !== "all") {
      query = query.eq("sale_type", filter);
    }

    (query as unknown as Promise<{ data: SongWithArtist[] | null; error: unknown }>).then(({ data }) => {
      setSongs((data ?? []) as SongWithArtist[]);
      setLoading(false);
    });
  }, [filter]);

  const filters: { key: Filter; label: string; icon: React.ReactNode }[] = [
    { key: "all", label: "All", icon: <Filter size={14} /> },
    { key: "fixed", label: "Buy Now", icon: <DollarSign size={14} /> },
    { key: "pwyw", label: "Pay-What-You-Want", icon: <TrendingUp size={14} /> },
    { key: "auction", label: "Auction", icon: <Gavel size={14} /> },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Marketplace</h1>
        <p className="text-gray-400 text-sm mt-0.5">Buy, bid, and invest in music</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {filters.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => { setFilter(key); setLoading(true); }}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border transition-all",
              filter === key
                ? "bg-purple-600 border-purple-500 text-white"
                : "bg-white/5 border-white/10 text-gray-400 hover:border-white/30 hover:text-white"
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
              <div className="aspect-square bg-white/5 animate-pulse" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-white/5 rounded animate-pulse" />
                <div className="h-3 bg-white/5 rounded w-2/3 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : songs.length === 0 ? (
        <div className="text-center py-20">
          <DollarSign size={48} className="text-gray-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">No listings yet</h2>
          <p className="text-gray-400 text-sm">Artists haven&apos;t listed any music for sale yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {songs.map((song) => (
            <Link
              key={song.id}
              href={`/song/${song.id}#buy`}
              className="group rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all overflow-hidden"
            >
              {/* Cover */}
              <div className="relative aspect-square overflow-hidden">
                <Image
                  src={song.cover_url ?? `https://picsum.photos/seed/${song.id}/400/400`}
                  alt={song.title}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                  unoptimized
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                <div className="absolute bottom-2 left-2">
                  <span className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1",
                    song.sale_type === "fixed" ? "bg-green-500/90 text-white" :
                    song.sale_type === "pwyw" ? "bg-blue-500/90 text-white" :
                    "bg-orange-500/90 text-white"
                  )}>
                    {song.sale_type === "fixed" && <><DollarSign size={11} />${song.price?.toFixed(2)}</>}
                    {song.sale_type === "pwyw" && <><TrendingUp size={11} />PWYW</>}
                    {song.sale_type === "auction" && <><Gavel size={11} />Bid</>}
                  </span>
                </div>
              </div>

              {/* Info */}
              <div className="p-3">
                <h3 className="text-white text-sm font-semibold truncate">{song.title}</h3>
                <p className="text-gray-500 text-xs truncate mt-0.5">
                  {song.profiles?.display_name ?? song.profiles?.username}
                </p>
                {song.sale_type === "auction" && song.auction_end && (
                  <p className="text-orange-400 text-xs mt-1">
                    Ends {new Date(song.auction_end).toLocaleDateString()}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
