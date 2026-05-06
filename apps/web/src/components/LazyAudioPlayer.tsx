"use client";

import { Suspense, lazy } from "react";
import type { AudioPlayerProps } from "./AudioPlayer";

const AudioPlayer = lazy(() => import("./AudioPlayer"));

function AudioPlayerSkeleton() {
  return (
    <div className="relative mx-auto max-w-xl">
      <div className="absolute -inset-1 rounded-[1.6rem] bg-gradient-to-br from-white/20 via-brand-500/15 to-accent-500/20 blur-xl" />
      <div className="relative rounded-[1.55rem] border border-white/15 bg-gradient-to-b from-zinc-800 via-[#11131b] to-black p-2 shadow-2xl shadow-black/60">
        <div className="relative overflow-hidden rounded-[1.15rem] border border-white/10 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.16),transparent_32%),linear-gradient(135deg,rgba(12,16,28,0.96),rgba(0,0,0,0.98))] p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 h-3 w-24 animate-pulse rounded bg-white/10" />
              <div className="h-4 w-40 animate-pulse rounded bg-white/15" />
            </div>
            <div className="h-5 w-10 animate-pulse rounded bg-white/10" />
          </div>
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 animate-pulse rounded-full bg-white/10" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-12 animate-pulse rounded-xl bg-white/5" />
              <div className="flex justify-between">
                <div className="h-3 w-8 animate-pulse rounded bg-white/10" />
                <div className="h-3 w-8 animate-pulse rounded bg-white/10" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto mt-2 h-4 w-24 rounded-b-2xl bg-gradient-to-b from-zinc-700 to-zinc-950" />
      <div className="mx-auto h-1.5 w-36 rounded-full bg-black/70" />
    </div>
  );
}

export default function LazyAudioPlayer(props: AudioPlayerProps) {
  return (
    <Suspense fallback={<AudioPlayerSkeleton />}>
      <AudioPlayer {...props} />
    </Suspense>
  );
}