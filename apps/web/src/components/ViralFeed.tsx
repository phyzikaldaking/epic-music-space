"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { demoViralClips, rankViralClips, type ViralClip } from "@/lib/viralClips";
import { personalizeClips, type BehaviorEvent } from "@/lib/personalization";

function buildLoopedFeed(clips: ViralClip[], pages: number) {
  return Array.from({ length: pages }).flatMap((_, pageIndex) =>
    clips.map((clip) => ({ ...clip, id: `${clip.id}-page-${pageIndex}` })),
  );
}

function baseClipId(id: string) {
  return id.replace(/-page-\d+$/, "");
}

export default function ViralFeed() {
  const [mode, setMode] = useState<"foryou" | "trending">("foryou");
  const [behaviorEvents, setBehaviorEvents] = useState<BehaviorEvent[]>([]);
  const rankedClips = useMemo(() => {
    const trending = rankViralClips(demoViralClips);
    return mode === "foryou" ? personalizeClips(trending, behaviorEvents) : trending;
  }, [behaviorEvents, mode]);

  const [pages, setPages] = useState(1);
  const clips = useMemo(() => buildLoopedFeed(rankedClips, pages), [rankedClips, pages]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [reshuffleNotice, setReshuffleNotice] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const activeStartedAt = useRef<number>(Date.now());
  const tracked75 = useRef<Set<string>>(new Set());

  function trackBehavior(clip: ViralClip, eventType: BehaviorEvent["eventType"], value = 0) {
    const cleanClipId = baseClipId(clip.id);
    const event: BehaviorEvent = {
      clipId: cleanClipId,
      songId: clip.songId,
      artist: clip.artist,
      eventType,
      eventCategory: clip.eventType,
      value,
      createdAt: new Date().toISOString(),
    };

    setBehaviorEvents((current) => [event, ...current].slice(0, 120));

    void fetch("/api/behavior/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    }).catch(() => undefined);

    if (["like", "share", "watch_75", "view_track"].includes(eventType)) {
      setReshuffleNotice(true);
      window.setTimeout(() => setReshuffleNotice(false), 1800);
    }
  }

  useEffect(() => {
    observerRef.current?.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const index = Number((entry.target as HTMLElement).dataset.index ?? 0);
          const previousClip = clips[activeIndex];
          if (previousClip && Date.now() - activeStartedAt.current < 1800) {
            trackBehavior(previousClip, "skip", -1);
          }

          setActiveIndex(index);
          activeStartedAt.current = Date.now();
          const activeClip = clips[index];
          if (activeClip) trackBehavior(activeClip, "view");

          if (index >= clips.length - 2) {
            setPages((current) => Math.min(current + 1, 8));
          }
        });
      },
      { threshold: 0.72 },
    );

    itemRefs.current.forEach((item) => {
      if (item) observerRef.current?.observe(item);
    });

    return () => observerRef.current?.disconnect();
  }, [clips.length, activeIndex]);

  useEffect(() => {
    const clip = clips[activeIndex];
    if (!clip) return;
    const cleanId = baseClipId(clip.id);
    const timeout = window.setTimeout(() => {
      if (tracked75.current.has(cleanId)) return;
      tracked75.current.add(cleanId);
      trackBehavior(clip, "watch_75", 2);
    }, 4500);
    return () => window.clearTimeout(timeout);
  }, [activeIndex, clips]);

  function scrollToIndex(index: number) {
    itemRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function likeClip(clip: ViralClip) {
    trackBehavior(clip, "like", 3);
  }

  function shareClip(clip: ViralClip) {
    trackBehavior(clip, "share", 5);
    if (navigator.share) {
      void navigator.share({ title: clip.title, text: clip.caption, url: window.location.href }).catch(() => undefined);
    }
  }

  function viewTrack(clip: ViralClip) {
    trackBehavior(clip, "view_track", 4);
  }

  return (
    <main className="relative h-screen overflow-hidden bg-black text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(253,224,71,0.16),transparent_32%),radial-gradient(circle_at_10%_28%,rgba(34,211,238,0.14),transparent_30%),linear-gradient(180deg,#050507,#08080d_48%,#050507)]" />

      <header className="fixed left-0 right-0 top-0 z-30 flex items-center justify-between px-5 py-5 md:px-8">
        <div className="pointer-events-none">
          <p className="text-[10px] font-black uppercase tracking-[0.32em] text-gold-100/75">Epic Music Space</p>
          <h1 className="mt-1 text-2xl font-black tracking-[-0.06em] text-white md:text-4xl">Viral Moments</h1>
        </div>
        <div className="flex items-center gap-2">
          {reshuffleNotice && <span className="rounded-full border border-cyan-200/25 bg-cyan-200/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100 backdrop-blur-xl">Feed adapting</span>}
          <button type="button" onClick={() => setMode(mode === "foryou" ? "trending" : "foryou")} className="rounded-full border border-white/10 bg-black/45 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white/70 backdrop-blur-xl transition hover:bg-white/10">
            {mode === "foryou" ? "For You" : "Trending"}
          </button>
        </div>
      </header>

      <section className="relative z-10 h-screen snap-y snap-mandatory overflow-y-auto scroll-smooth">
        {clips.map((clip, index) => {
          const isActive = index === activeIndex;
          return (
            <article key={clip.id} data-index={index} ref={(node) => { itemRefs.current[index] = node; }} className="relative flex h-screen snap-start items-center justify-center px-4 py-24 md:px-8">
              <div className="grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
                <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.045] shadow-2xl shadow-black/60 backdrop-blur-2xl">
                  <div className="aspect-[9/16] max-h-[74vh] w-full bg-black md:aspect-video md:max-h-[72vh]">
                    {clip.clipUrl ? (
                      <video src={clip.clipUrl} className="h-full w-full object-cover" muted playsInline loop autoPlay={isActive} controls={false} />
                    ) : (
                      <div className="relative grid h-full place-items-center overflow-hidden bg-[radial-gradient(circle_at_30%_20%,rgba(253,224,71,0.20),transparent_30%),radial-gradient(circle_at_75%_55%,rgba(34,211,238,0.18),transparent_35%),linear-gradient(135deg,#101018,#030305)]">
                        <div className="absolute inset-0 opacity-[0.22] [background-image:linear-gradient(to_right,rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,.06)_1px,transparent_1px)] [background-size:52px_52px]" />
                        <div className={`relative rounded-full border border-gold-200/25 bg-gold-200/10 px-5 py-3 text-xs font-black uppercase tracking-[0.24em] text-gold-100 shadow-2xl shadow-gold-500/20 ${isActive ? "animate-pulse" : ""}`}>Auto Clip Preview</div>
                      </div>
                    )}
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/72 to-transparent p-5 md:p-7">
                    <p className="text-[10px] font-black uppercase tracking-[0.26em] text-gold-100/80">{clip.eventType.replace("_", " ")}</p>
                    <h2 className="mt-2 max-w-3xl text-3xl font-black leading-[0.96] tracking-[-0.06em] text-white md:text-6xl">{clip.title}</h2>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-white/62 md:text-base">{clip.caption}</p>
                  </div>
                </div>

                <aside className="rounded-[2rem] border border-white/10 bg-black/42 p-5 shadow-2xl shadow-black/45 backdrop-blur-2xl">
                  <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
                    <div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">Now Playing</p><p className="mt-1 text-xl font-black tracking-[-0.045em] text-white">{clip.artist ?? "EMS Artist"}</p></div>
                    <div className="rounded-2xl border border-gold-200/25 bg-gold-200/10 px-3 py-2 text-sm font-black text-gold-100">🔥 {clip.score}</div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Views</p><p className="mt-1 text-2xl font-black text-white">{clip.views.toLocaleString()}</p></div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Likes</p><p className="mt-1 text-2xl font-black text-white">{clip.likes.toLocaleString()}</p></div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Shares</p><p className="mt-1 text-2xl font-black text-white">{clip.shares.toLocaleString()}</p></div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Comments</p><p className="mt-1 text-2xl font-black text-white">{clip.comments.toLocaleString()}</p></div>
                  </div>

                  <div className="mt-5 grid gap-2">
                    <button type="button" onClick={() => likeClip(clip)} className="rounded-2xl bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-black transition hover:bg-gold-200">Like Moment</button>
                    <button type="button" onClick={() => shareClip(clip)} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-white transition hover:bg-white/10">Share Clip</button>
                    <a onClick={() => viewTrack(clip)} href={clip.songId ? `/track/${clip.songId}` : "/marketplace"} className="rounded-2xl border border-gold-200/20 bg-gold-200/10 px-4 py-3 text-center text-sm font-black uppercase tracking-[0.14em] text-gold-100 transition hover:bg-gold-200/20">View Track</a>
                  </div>

                  <div className="mt-5 rounded-2xl border border-cyan-200/12 bg-cyan-200/[0.045] p-3 text-[11px] font-semibold leading-5 text-cyan-100/70">
                    {mode === "foryou" ? "This feed reshuffles in real time as you watch, like, skip, share, and click tracks." : "Trending mode uses platform-wide viral rank only."}
                  </div>

                  <div className="mt-5 flex items-center justify-between text-xs font-bold uppercase tracking-[0.16em] text-white/35">
                    <button type="button" onClick={() => scrollToIndex(Math.max(0, index - 1))} className="hover:text-white">Prev</button>
                    <span>{index + 1} / {clips.length}</span>
                    <button type="button" onClick={() => scrollToIndex(Math.min(clips.length - 1, index + 1))} className="hover:text-white">Next</button>
                  </div>
                </aside>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
