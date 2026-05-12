"use client";

// #12: Genre-Specific Effect Chains
export function GenreEffectChains({ genre }: { genre: string }) {
  const presets: Record<string, string[]> = {
    trap: ["808 Bass Comp", "Snare Reverb", "Sidechain"],
    house: ["Kick Compression", "Groove EQ", "Dub Reverb"],
    dnb: ["Breakbeat Compressor", "Tight Reverb", "Exciter"],
    ambient: ["Hall Reverb", "Lush Delay", "Soft Limiter"],
  };

  return (
    <div className="rounded-lg border border-white/10 bg-[#0c0c12] p-4">
      <h3 className="text-sm font-bold text-white mb-3">⚙️ Effect Presets</h3>
      <div className="space-y-1">
        {(presets[genre] || presets.ambient).map((fx) => (
          <button
            key={fx}
            className="w-full text-xs px-2 py-1 rounded border border-white/20 text-white hover:bg-white/10"
          >
            {fx}
          </button>
        ))}
      </div>
    </div>
  );
}

// #13: AI Mastering A/B Slider
export function AIMasteringSlider() {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0c0c12] p-4">
      <h3 className="text-sm font-bold text-white mb-3">🎚️ AI Mastering A/B</h3>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/60 w-8">Original</span>
          <input type="range" min="0" max="1" step="0.01" defaultValue="0.5" className="flex-1" />
          <span className="text-xs text-white/60 w-8">AI Master</span>
        </div>
        <p className="text-[10px] text-white/50">Drag to compare reference matching</p>
      </div>
    </div>
  );
}

// #14: Trending Sample Packs
export function TrendingSamplePacks() {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0c0c12] p-4">
      <h3 className="text-sm font-bold text-white mb-3">🎁 Trending This Week</h3>
      <div className="space-y-1">
        {["UK Garage Drums", "Synthwave Chords", "Ambient Textures"].map((pack) => (
          <button
            key={pack}
            className="w-full text-xs px-2 py-1 rounded border border-white/20 text-white hover:bg-white/10 text-left"
          >
            {pack}
          </button>
        ))}
      </div>
    </div>
  );
}

// #15: Social Listening Room
export function SocialListeningRoom() {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0c0c12] p-4">
      <h3 className="text-sm font-bold text-white mb-3">🎉 Listening Room</h3>
      <div className="space-y-2 text-xs text-white/70">
        <p>3 friends listening now</p>
        <div className="flex gap-1">
          <span>👍 +12 reactions</span>
          <span>💯 +8 vibes</span>
          <span>🔥 +5 fire</span>
        </div>
        <button className="w-full mt-2 px-3 py-1 rounded bg-tube-300 text-black font-bold">
          Join Chat
        </button>
      </div>
    </div>
  );
}
