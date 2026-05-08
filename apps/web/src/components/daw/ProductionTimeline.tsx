"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import type { BeatMachineState, LaneEqRecommendation } from "./dawEngine";
import type { DrumKind } from "./beatMachine";

function formatRelative(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return date.toLocaleDateString();
}

export interface ProductionPost {
  id: string;
  authorId: string;
  authorName: string;
  authorImage?: string;
  authorRole: "artist" | "producer" | "engineer" | "listener";
  isLiveNow: boolean;

  // Track metadata
  trackId: string;
  trackTitle: string;
  genre: string;
  bpm: number;
  key?: string;

  // Production snapshot
  beatMachineState?: BeatMachineState;
  spectrum: number[];
  masterLufs: number;
  masterTruePeak: number;
  mixConfidence: number; // 0-1 AI-derived mix health
  activeLaneCount: number;

  // Social engagement unique to music production
  remixCount: number;
  versionCount: number;
  stemDownloadCount: number;
  createdAt: Date;
  liveUntil?: Date;

  // Action data
  recommendedEqSettings?: LaneEqRecommendation[];
  suggestedKit?: string;
}

function avgBand(spectrum: number[], start: number, end: number): number {
  if (!spectrum.length) return 0;
  const band = spectrum.slice(start, end + 1);
  return band.reduce((a, b) => a + b, 0) / band.length;
}

function getFrequencyZones(spectrum: number[]) {
  return {
    sub: avgBand(spectrum, 0, 2),
    lowMid: avgBand(spectrum, 3, 8),
    mid: avgBand(spectrum, 9, 13),
    highMid: avgBand(spectrum, 14, 20),
    air: avgBand(spectrum, 25, 31),
  };
}

function getMixHealthColor(confidence: number) {
  if (confidence > 0.75) return "text-emerald-400";
  if (confidence > 0.55) return "text-cyan-400";
  if (confidence > 0.35) return "text-amber-400";
  return "text-red-400";
}

function getMixHealthTone(confidence: number) {
  if (confidence > 0.75) return "border-emerald-400/25 bg-emerald-500/10";
  if (confidence > 0.55) return "border-cyan-400/25 bg-cyan-500/10";
  if (confidence > 0.35) return "border-amber-400/25 bg-amber-500/10";
  return "border-red-400/25 bg-red-500/10";
}

// Frequency bar height classes mapped to percentages
const heightClasses: Record<number, string> = {
  5: "h-[5%]",
  10: "h-[10%]",
  15: "h-[15%]",
  20: "h-[20%]",
  25: "h-[25%]",
  30: "h-[30%]",
  35: "h-[35%]",
  40: "h-[40%]",
  45: "h-[45%]",
  50: "h-[50%]",
  55: "h-[55%]",
  60: "h-[60%]",
  65: "h-[65%]",
  70: "h-[70%]",
  75: "h-[75%]",
  80: "h-[80%]",
  85: "h-[85%]",
  90: "h-[90%]",
  95: "h-[95%]",
  100: "h-full",
};

function getHeightClass(percentage: number): string {
  const rounded = Math.round(percentage / 5) * 5;
  return heightClasses[Math.max(5, Math.min(100, rounded))] || "h-[5%]";
}

function FrequencyVisualization({
  zones,
}: {
  zones: Record<string, number>;
}) {
  const zoneEntries = Object.entries(zones);
  const maxValue = Math.max(...zoneEntries.map(([, v]) => v));

  return (
    <div className="mb-3 rounded-md bg-black/40 p-3">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/60">
        Frequency profile
      </p>
      <div className="flex items-end justify-between gap-1 h-12">
        {zoneEntries.map(([zone, value]) => {
          const percentage = (value / maxValue) * 100;
          const heightClass = getHeightClass(percentage);
          return (
            <div
              key={zone}
              className={`flex-1 rounded-t-sm bg-gradient-to-t from-cyan-500 to-cyan-300 opacity-70 ${heightClass}`}
              title={`${zone}: ${value.toFixed(2)}`}
            />
          );
        })}
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1 text-[8px] font-bold uppercase text-white/40">
        <span>Sub</span>
        <span>Low</span>
        <span>Mid</span>
        <span>High</span>
        <span>Air</span>
      </div>
    </div>
  );
}

export function ProductionPostCard({
  post,
  onApplyKit,
  onApplyEqSettings,
  onPreviewStems,
}: {
  post: ProductionPost;
  onApplyKit?: (kitName: string) => void;
  onApplyEqSettings?: (settings: LaneEqRecommendation[]) => void;
  onPreviewStems?: (trackId: string) => void;
}) {
  const zones = getFrequencyZones(post.spectrum);
  const roleEmoji = {
    artist: "🎤",
    producer: "🎛️",
    engineer: "🔧",
    listener: "👂",
  };

  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-white/12 bg-white/[0.03] p-4">
      {/* Header: Author + Live Status */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {post.authorImage && (
            <img
              alt={post.authorName}
              src={post.authorImage}
              className="h-8 w-8 rounded-full object-cover"
            />
          )}
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-white">
                {roleEmoji[post.authorRole]} {post.authorName}
              </p>
              {post.isLiveNow && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-red-300">
                  ● Live now
                </span>
              )}
            </div>
            <p className="text-[11px] text-white/50">{formatRelative(post.createdAt)}</p>
          </div>
        </div>
      </div>

      {/* Track Title & Metadata */}
      <div className="mb-3">
        <p className="text-sm font-bold text-white">{post.trackTitle}</p>
        <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-wider text-white/60">
          <span>{post.bpm} BPM</span>
          {post.key && <span>• {post.key}</span>}
          <span>• {post.genre}</span>
        </div>
      </div>

      {/* Frequency Spectrum Visualization */}
      <FrequencyVisualization zones={zones} />

      {/* Mix Health Scorecard */}
      <div
        className={`mb-3 rounded-lg border p-3 ${getMixHealthTone(post.mixConfidence)}`}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/60">
              Mix health
            </p>
            <p className={`mt-1 text-sm font-bold ${getMixHealthColor(post.mixConfidence)}`}>
              {(post.mixConfidence * 100).toFixed(0)}% confidence
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/60">
              Active lanes
            </p>
            <p className="mt-1 text-sm font-bold text-cyan-100">{post.activeLaneCount}/8</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/60">
              Loudness
            </p>
            <p className="mt-1 text-sm font-bold text-white">
              {post.masterLufs.toFixed(1)} LUFS
            </p>
          </div>
        </div>
      </div>

      {/* Production Stats */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="rounded-md bg-white/5 p-2">
          <p className="text-[9px] font-bold uppercase tracking-widest text-white/50">
            Remixes
          </p>
          <p className="mt-1 text-lg font-bold text-cyan-100">{post.remixCount}</p>
        </div>
        <div className="rounded-md bg-white/5 p-2">
          <p className="text-[9px] font-bold uppercase tracking-widest text-white/50">
            Versions
          </p>
          <p className="mt-1 text-lg font-bold text-cyan-100">{post.versionCount}</p>
        </div>
        <div className="rounded-md bg-white/5 p-2">
          <p className="text-[9px] font-bold uppercase tracking-widest text-white/50">
            Stem DLs
          </p>
          <p className="mt-1 text-lg font-bold text-cyan-100">{post.stemDownloadCount}</p>
        </div>
      </div>

      {/* Quick Action Buttons */}
      <div className="flex flex-wrap gap-2">
        {post.recommendedEqSettings && post.recommendedEqSettings.length > 0 && (
          <button
            onClick={() => onApplyEqSettings?.(post.recommendedEqSettings!)}
            className="flex-1 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-cyan-100 hover:bg-cyan-500/20"
          >
            Apply EQ ({post.recommendedEqSettings.length})
          </button>
        )}
        {post.suggestedKit && (
          <button
            onClick={() => onApplyKit?.(post.suggestedKit!)}
            className="flex-1 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-amber-100 hover:bg-amber-500/20"
          >
            Load kit: {post.suggestedKit}
          </button>
        )}
        <button
          onClick={() => onPreviewStems?.(post.trackId)}
          className="flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-white/70 hover:bg-white/10"
        >
          Preview stems
        </button>
      </div>
    </div>
  );
}

export default function ProductionTimeline({
  onApplyKit,
  onApplyEqSettings,
  onPreviewStems,
}: {
  onApplyKit?: (kitName: string) => void;
  onApplyEqSettings?: (settings: LaneEqRecommendation[]) => void;
  onPreviewStems?: (trackId: string) => void;
}) {
  const [posts, setPosts] = useState<ProductionPost[]>([]);
  const [filter, setFilter] = useState<"all" | "live" | "recommended">("all");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch production posts from API
  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const res = await fetch("/api/production-timeline");
        if (!res.ok) return;
        const data: ProductionPost[] = await res.json();
        setPosts(
          data.map((p) => ({
            ...p,
            createdAt: new Date(p.createdAt),
            ...(p.liveUntil && { liveUntil: new Date(p.liveUntil) }),
          })),
        );
      } catch (e) {
        console.error("Failed to fetch production posts:", e);
      }
    };

    fetchPosts();
    pollRef.current = setInterval(fetchPosts, 12000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const filteredPosts = useMemo(() => {
    if (filter === "live") {
      return posts.filter((p) => p.isLiveNow);
    }
    if (filter === "recommended") {
      return posts.filter((p) => p.mixConfidence > 0.7 && p.remixCount > 0);
    }
    return posts;
  }, [posts, filter]);

  return (
    <section className="mb-6 rounded-2xl border border-white/12 bg-white/[0.03] p-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-100/75">
            Production timeline
          </p>
          <p className="mt-1 text-sm font-semibold text-white">
            Real-time beats from your community
          </p>
        </div>
        <span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-cyan-100">
          Live feed
        </span>
      </header>

      {/* Filter Tabs */}
      <div className="mb-4 flex gap-2 border-b border-white/10">
        {(["all", "live", "recommended"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors ${
              filter === f
                ? "border-b-2 border-cyan-400 text-cyan-100"
                : "border-b-2 border-transparent text-white/50 hover:text-white/70"
            }`}
          >
            {f === "all"
              ? `All (${posts.length})`
              : f === "live"
                ? `Live (${posts.filter((p) => p.isLiveNow).length})`
                : `Recommended (${posts.filter((p) => p.mixConfidence > 0.7).length})`}
          </button>
        ))}
      </div>

      {/* Posts Feed */}
      <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
        {filteredPosts.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-black/25 p-6 text-center">
            <p className="text-sm text-white/60">
              {filter === "live"
                ? "No live studios right now. Check back soon!"
                : "No posts yet. Be the first to share your production!"}
            </p>
          </div>
        ) : (
          filteredPosts.map((post) => (
            <ProductionPostCard
              key={post.id}
              post={post}
              onApplyKit={onApplyKit}
              onApplyEqSettings={onApplyEqSettings}
              onPreviewStems={onPreviewStems}
            />
          ))
        )}
      </div>
    </section>
  );
}
