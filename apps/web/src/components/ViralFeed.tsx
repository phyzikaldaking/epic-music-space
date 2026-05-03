"use client";

import { demoViralClips, rankViralClips } from "@/lib/viralClips";

export default function ViralFeed() {
  const clips = rankViralClips(demoViralClips);

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <h1 className="text-4xl font-black mb-6">🔥 Viral Feed</h1>

      <div className="grid gap-6 md:grid-cols-2">
        {clips.map((clip) => (
          <div key={clip.id} className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="h-48 bg-black/40 rounded mb-3 flex items-center justify-center">
              <span className="text-white/40 text-xs">Clip Preview</span>
            </div>

            <h2 className="text-xl font-bold">{clip.title}</h2>
            <p className="text-sm text-white/60 mt-1">{clip.caption}</p>

            <div className="flex justify-between mt-4 text-xs text-white/50">
              <span>🔥 {clip.score}</span>
              <span>👁 {clip.views}</span>
              <span>❤️ {clip.likes}</span>
              <span>🔁 {clip.shares}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
