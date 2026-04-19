"use client";

import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Rocket, Megaphone, Music, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Billboard } from "@/types/database";

// Dynamic import — Babylon.js must only run client-side
const CityScene = dynamic(
  () => import("@/components/city/CityScene").then((m) => m.CityScene),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#050510] text-gray-400 gap-3">
        <Loader2 size={32} className="animate-spin text-purple-400" />
        <p className="text-sm">Loading city…</p>
      </div>
    ),
  }
);

export default function CityPage() {
  const [billboards, setBillboards] = useState<Billboard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("billboards")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("slot")
      .then(({ data }) => {
        setBillboards((data ?? []) as Billboard[]);
        setLoading(false);
      });
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-black/20 shrink-0">
        <div className="flex items-center gap-2">
          <Rocket size={18} className="text-purple-400" />
          <span className="text-white font-semibold text-sm">EMS Downtown Prime</span>
          <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs font-medium">
            Live
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/billboard"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-300 text-xs hover:bg-purple-600/40 transition-colors"
          >
            <Megaphone size={13} />
            Buy Billboard
          </Link>
          <Link
            href="/upload"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 border border-white/20 text-white text-xs hover:bg-white/20 transition-colors"
          >
            <Music size={13} />
            Upload Music
          </Link>
        </div>
      </div>

      {/* Instructions */}
      <div className="flex items-center gap-4 px-4 py-1.5 bg-black/30 text-xs text-gray-500 shrink-0">
        <span>🖱 Drag to orbit</span>
        <span>🔍 Scroll to zoom</span>
        <span>📍 {billboards.length} active billboard{billboards.length !== 1 ? "s" : ""}</span>
      </div>

      {/* 3D Scene */}
      <div className="flex-1 relative">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center bg-[#050510]">
            <Loader2 size={32} className="animate-spin text-purple-400" />
          </div>
        ) : (
          <CityScene
            billboards={billboards}
            className="w-full h-full block"
          />
        )}

        {/* Overlay: empty state */}
        {!loading && billboards.length === 0 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center pointer-events-none">
            <div className="px-4 py-2 rounded-2xl bg-black/70 border border-white/10 text-gray-400 text-sm">
              No active billboards — be the first to advertise!
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
