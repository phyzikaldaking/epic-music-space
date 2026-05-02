"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabaseClient, CHANNELS } from "@/lib/supabase";

interface FeedItem {
  id: string;
  type: "license_sold" | "new_song";
  title: string;
  artist: string;
  coverUrl?: string | null;
  soldLicenses?: number;
  timestamp: number;
}

/**
 * LiveMarketplaceFeed
 *
 * A non-intrusive live ticker that subscribes to the ems:marketplace Supabase
 * channel and shows a brief toast whenever a new song is added or a license
 * is sold. Gracefully degrades when Supabase is not configured.
 */
export default function LiveMarketplaceFeed() {
  const [items, setItems] = useState<FeedItem[]>([]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;

    function push(item: Omit<FeedItem, "id" | "timestamp">) {
      const entry: FeedItem = {
        ...item,
        id: Math.random().toString(36).slice(2),
        timestamp: Date.now(),
      };
      setItems((prev) => [entry, ...prev].slice(0, 5));
      // Auto-remove after 6 seconds
      setTimeout(() => {
        setItems((prev) => prev.filter((i) => i.id !== entry.id));
      }, 6000);
    }

    const channel = supabase
      .channel(CHANNELS.marketplace)
      .on("broadcast", { event: "license_sold" }, ({ payload }) => {
        const p = payload as { title: string; artist: string; coverUrl?: string | null; soldLicenses?: number };
        push({ type: "license_sold", title: p.title, artist: p.artist, coverUrl: p.coverUrl, soldLicenses: p.soldLicenses });
      })
      .on("broadcast", { event: "new_song" }, ({ payload }) => {
        const p = payload as { title: string; artist: string; coverUrl?: string | null };
        push({ type: "new_song", title: p.title, artist: p.artist, coverUrl: p.coverUrl });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col-reverse gap-2 max-w-xs w-full pointer-events-none">
      {items.map((item) => (
        <div
          key={item.id}
          className={`flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-xl backdrop-blur-md animate-fade-in pointer-events-auto ${
            item.type === "license_sold"
              ? "border-gold-500/40 bg-[#1a1500]/90 text-gold-300"
              : "border-brand-500/40 bg-[#0d0d1a]/90 text-brand-300"
          }`}
        >
          {/* Cover thumbnail */}
          <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-lg bg-white/10 flex items-center justify-center text-base">
            {item.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.coverUrl}
                alt={`${item.title} cover art`}
                width={72}
                height={72}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            ) : item.type === "license_sold" ? (
              "🎟️"
            ) : (
              "🎵"
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold leading-tight line-clamp-1">
              {item.type === "license_sold" ? "🔥 License sold" : "✨ New track"}
            </p>
            <p className="text-[11px] text-white/60 line-clamp-1">
              {item.title}
              <span className="text-white/35"> — {item.artist}</span>
            </p>
            {item.type === "license_sold" && item.soldLicenses && (
              <p className="text-[10px] text-gold-400/70">{item.soldLicenses} sold total</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
