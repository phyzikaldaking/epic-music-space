"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BeatMachineState, LaneEqRecommendation } from "./dawEngine";

function formatRelative(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const time = date.getTime();
  if (!Number.isFinite(time)) return "just now";
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return Math.floor(seconds / 60) + "m";
  if (seconds < 86400) return Math.floor(seconds / 3600) + "h";
  if (seconds < 604800) return Math.floor(seconds / 86400) + "d";
  return date.toLocaleDateString();
}

export interface ProductionPost {
  id: string;
  authorId: string;
  authorName: string;
  authorImage?: string;
  authorRole: "artist" | "producer" | "engineer" | "listener";
  isLiveNow: boolean;
  trackId: string;
  trackTitle: string;
  genre: string;
  bpm: number;
  key?: string;
  beatMachineState?: BeatMachineState;
  spectrum: number[];
  masterLufs: number;
  masterTruePeak: number;
  mixConfidence: number;
  activeLaneCount: number;
  remixCount: number;
  versionCount: number;
  stemDownloadCount: number;
  createdAt: Date;
  liveUntil?: Date;
  recommendedEqSettings?: LaneEqRecommendation[];
  suggestedKit?: string;
}

type ProductionPostPayload = Omit<ProductionPost, "createdAt" | "liveUntil"> & {
  createdAt: string | Date;
  liveUntil?: string | Date;
};

type ProductionTimelineResponse =
  | ProductionPostPayload[]
  | { posts?: ProductionPostPayload[]; nextCursor?: string | null; error?: string };

function normalizePosts(payload: ProductionTimelineResponse): ProductionPost[] {
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload.posts) ? payload.posts : [];
  return rows.map((post) => {
    const { liveUntil, ...rest } = post;
    return {
      ...rest,
      createdAt: new Date(post.createdAt),
      ...(liveUntil ? { liveUntil: new Date(liveUntil) } : {}),
    };
  });
}

function avgBand(spectrum: number[], start: number, end: number): number {
  if (!spectrum.length) return 0;
  const band = spectrum.slice(Math.max(0, start), Math.min(spectrum.length, end + 1));
  if (!band.length) return spectrum[spectrum.length - 1] ?? 0;
  return band.reduce((a, b) => a + b, 0) / band.length;
}

function getFrequencyZones(spectrum: number[]) {
  const last = Math.max(0, spectrum.length - 1);
  return {
    sub: avgBand(spectrum, 0, Math.min(2, last)),
    lowMid: avgBand(spectrum, 3, Math.min(7, last)),
    mid: avgBand(spectrum, 8, Math.min(12, last)),
    highMid: avgBand(spectrum, 13, Math.min(16, last)),
    air: avgBand(spectrum, 17, last),
  };
}

function getMixHealthColor(confidence: number) {
  if (confidence > 0.75) return "text-emerald-300";
  if (confidence > 0.55) return "text-cyan-300";
  if (confidence > 0.35) return "text-amber-300";
  return "text-white/55";
}

function initials(name: string) {
  const parts = name.trim().split(/s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "E").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase();
}

function roleLabel(role: ProductionPost["authorRole"]) {
  return role === "producer" ? "Producer" : role === "engineer" ? "Engineer" : role === "artist" ? "Artist" : "Listener";
}

function FrequencyVisualization({ spectrum }: { spectrum: number[] }) {
  const zones = getFrequencyZones(spectrum);
  const entries = Object.entries(zones);
  const maxValue = Math.max(1, ...entries.map(([, value]) => value));

  return (
    <div className="flex h-12 items-end gap-1" aria-label="Track energy profile">
      {entries.map(([zone, value]) => (
        <span
          key={zone}
          className="flex-1 rounded-t bg-cyan-300/70"
          style={{ height: Math.max(12, Math.round((value / maxValue) * 100)) + "%" }}
          title={zone + ": " + value.toFixed(0)}
        />
      ))}
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
  const mixPercent = Math.round(post.mixConfidence * 100);
  const hasEq = Boolean(post.recommendedEqSettings?.length);

  return (
    <article className="rounded-2xl border border-white/10 bg-[#111018]/92 p-3 shadow-lg shadow-black/20 sm:p-4">
      <header className="flex items-start gap-3">
        {post.authorImage ? (
          <img
            alt={post.authorName}
            src={post.authorImage}
            className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full border border-white/10 bg-white/8 text-xs font-black text-white/80">
            {initials(post.authorName)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate text-sm font-bold text-white">{post.authorName}</p>
            <span className="text-xs text-white/35">{formatRelative(post.createdAt)}</span>
            {post.isLiveNow && (
              <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-red-200">
                Live now
              </span>
            )}
          </div>
          <p className="text-xs text-white/45">{roleLabel(post.authorRole)} shared marketplace activity</p>
        </div>
        <button
          type="button"
          className="rounded-full border border-white/10 px-2 py-1 text-xs font-bold text-white/45 hover:bg-white/5"
          aria-label={"More actions for " + post.trackTitle}
        >
          More
        </button>
      </header>

      <p className="mt-3 text-sm leading-6 text-white/78">
        New drop: <span className="font-semibold text-white">{post.trackTitle}</span> is moving through the floor.
        Listen, react, and decide if it belongs in your next session.
      </p>

      <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200/70">Track</p>
            <h3 className="mt-1 truncate text-lg font-black text-white">{post.trackTitle}</h3>
            <p className="mt-1 text-xs text-white/50">
              {post.genre} · {post.bpm} BPM{post.key ? " · " + post.key : ""}
            </p>
          </div>
          <div className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-right">
            <p className={"text-sm font-black " + getMixHealthColor(post.mixConfidence)}>{mixPercent}%</p>
            <p className="text-[9px] font-bold uppercase tracking-wider text-white/35">Mix</p>
          </div>
        </div>
        <div className="mt-3 rounded-lg bg-white/[0.03] p-2">
          <FrequencyVisualization spectrum={post.spectrum} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg bg-white/[0.04] px-2 py-2">
            <p className="font-black text-white">{post.remixCount}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-wider text-white/35">Remixes</p>
          </div>
          <div className="rounded-lg bg-white/[0.04] px-2 py-2">
            <p className="font-black text-white">{post.versionCount}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-wider text-white/35">Versions</p>
          </div>
          <div className="rounded-lg bg-white/[0.04] px-2 py-2">
            <p className="font-black text-white">{post.stemDownloadCount}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-wider text-white/35">Stems</p>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-white/8 pt-3">
        <button type="button" className="flex-1 rounded-lg bg-white/[0.04] px-3 py-2 text-xs font-bold text-white/70 hover:bg-white/[0.08]">
          Like
        </button>
        <button type="button" className="flex-1 rounded-lg bg-white/[0.04] px-3 py-2 text-xs font-bold text-white/70 hover:bg-white/[0.08]">
          Comment
        </button>
        <button type="button" className="flex-1 rounded-lg bg-white/[0.04] px-3 py-2 text-xs font-bold text-white/70 hover:bg-white/[0.08]">
          Share
        </button>
        {hasEq && (
          <button
            type="button"
            onClick={() => onApplyEqSettings?.(post.recommendedEqSettings!)}
            className="flex-1 rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-100 hover:bg-cyan-500/20"
          >
            Apply EQ
          </button>
        )}
        {post.suggestedKit && (
          <button
            type="button"
            onClick={() => onApplyKit?.(post.suggestedKit!)}
            className="flex-1 rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-100 hover:bg-amber-500/20"
          >
            Load kit
          </button>
        )}
        <button
          type="button"
          onClick={() => onPreviewStems?.(post.trackId)}
          className="flex-1 rounded-lg border border-white/12 bg-white/[0.03] px-3 py-2 text-xs font-bold text-white/70 hover:bg-white/[0.08]"
        >
          Preview
        </button>
      </div>
    </article>
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchPosts = async () => {
      try {
        const res = await fetch("/api/production-timeline", { cache: "no-store" });
        if (!res.ok) throw new Error("Timeline request failed with " + res.status);
        const payload = (await res.json()) as ProductionTimelineResponse;
        if (cancelled) return;
        setPosts(normalizePosts(payload));
        setError(null);
      } catch (e) {
        if (!cancelled) {
          console.error("Failed to fetch production posts:", e);
          setError("Marketplace activity is temporarily offline.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchPosts();
    pollRef.current = setInterval(() => void fetchPosts(), 12000);
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const recommendedPosts = useMemo(
    () => posts.filter((p) => p.mixConfidence >= 0.55 || p.remixCount > 0 || p.versionCount > 1),
    [posts],
  );

  const filteredPosts = useMemo(() => {
    if (filter === "live") return posts.filter((p) => p.isLiveNow);
    if (filter === "recommended") return recommendedPosts;
    return posts;
  }, [posts, recommendedPosts, filter]);

  const tabs = [
    { id: "all" as const, label: "All", count: posts.length },
    { id: "live" as const, label: "Live", count: posts.filter((p) => p.isLiveNow).length },
    { id: "recommended" as const, label: "For you", count: recommendedPosts.length },
  ];

  return (
    <section className="mx-auto mb-5 w-full max-w-2xl">
      <header className="mb-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-100/70">Marketplace activity</p>
            <h2 className="mt-1 text-lg font-black text-white">Live feed</h2>
          </div>
          <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-100">
            Updated
          </span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-black/25 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={"rounded-lg px-2 py-2 text-xs font-bold transition " + (filter === tab.id ? "bg-white text-black" : "text-white/55 hover:bg-white/8 hover:text-white")}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center text-sm text-white/55">
          Loading marketplace activity...
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-5 text-center text-sm text-amber-100">
          {error}
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center text-sm text-white/55">
          {filter === "live" ? "No live studios right now. Check back soon." : "No posts yet. Be the first to share your production."}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPosts.map((post) => (
            <ProductionPostCard
              key={post.id}
              post={post}
              onApplyKit={onApplyKit}
              onApplyEqSettings={onApplyEqSettings}
              onPreviewStems={onPreviewStems}
            />
          ))}
        </div>
      )}
    </section>
  );
}
