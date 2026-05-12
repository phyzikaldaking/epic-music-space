"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

const TikTokSyncPanel = dynamic(() => import("./TikTokSyncPanel"), { ssr: false });
const ProducerBattleMode = dynamic(() => import("./ProducerBattleMode"), { ssr: false });
const RemixGenerator = dynamic(() => import("./RemixGenerator"), { ssr: false });
const VibeMatchBrowser = dynamic(() => import("./VibeMatchBrowser"), { ssr: false });
const VocalHarmonyStacker = dynamic(() => import("./VocalHarmonyStacker"), { ssr: false });
const VocalKeyDetection = dynamic(() => import("./VocalKeyDetection"), { ssr: false });
const LiveJamSessions = dynamic(() => import("./LiveJamSessions"), { ssr: false });
const CollaborationDrafts = dynamic(() => import("./CollaborationDrafts"), { ssr: false });
const SmartLoopSuggestions = dynamic(() => import("./SmartLoopSuggestions"), { ssr: false });
const DrumPatternDNAMixer = dynamic(() => import("./DrumPatternDNAMixer"), { ssr: false });
const PhaseFFeaturesComponents = dynamic(() => import("./PhaseFFeaturesComponents"), { ssr: false });

type TabId = 
  | "tiktok"
  | "battle"
  | "remix"
  | "vibe"
  | "harmonies"
  | "key-detect"
  | "jam"
  | "collab"
  | "loops"
  | "dna"
  | "effects";

export default function AIFeaturesHub() {
  const [activeTab, setActiveTab] = useState<TabId>("tiktok");

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: "tiktok", label: "TikTok Sync", icon: "🎵" },
    { id: "battle", label: "Battles", icon: "⚔️" },
    { id: "remix", label: "Remix", icon: "🎛️" },
    { id: "vibe", label: "Vibe Match", icon: "✨" },
    { id: "harmonies", label: "Harmonies", icon: "🎼" },
    { id: "key-detect", label: "Key Detect", icon: "🎹" },
    { id: "jam", label: "Jam Sessions", icon: "🤝" },
    { id: "collab", label: "Collab", icon: "💬" },
    { id: "loops", label: "Smart Loops", icon: "🔄" },
    { id: "dna", label: "DNA Mixer", icon: "🧬" },
    { id: "effects", label: "Effects", icon: "⚙️" },
  ];

  return (
    <div className="flex flex-col h-full bg-[#0c0c12] border border-white/10 rounded-lg">
      {/* Tab Bar */}
      <div className="flex gap-1 p-2 border-b border-white/10 overflow-x-auto scrollbar-hide">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1 text-xs whitespace-nowrap rounded transition ${
              activeTab === tab.id
                ? "bg-tube-300 text-black font-bold"
                : "bg-white/5 text-white/60 hover:bg-white/10"
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === "tiktok" && <TikTokSyncPanel />}
        {activeTab === "battle" && <ProducerBattleMode />}
        {activeTab === "remix" && <RemixGenerator />}
        {activeTab === "vibe" && <VibeMatchBrowser />}
        {activeTab === "harmonies" && <VocalHarmonyStacker />}
        {activeTab === "key-detect" && <VocalKeyDetection />}
        {activeTab === "jam" && <LiveJamSessions />}
        {activeTab === "collab" && <CollaborationDrafts />}
        {activeTab === "loops" && <SmartLoopSuggestions />}
        {activeTab === "dna" && <DrumPatternDNAMixer />}
        {activeTab === "effects" && (
          <div className="space-y-3">
            <PhaseFFeaturesComponents.GenreEffectChains genre="trap" />
            <PhaseFFeaturesComponents.AIMasteringSlider />
            <PhaseFFeaturesComponents.TrendingSamplePacks />
            <PhaseFFeaturesComponents.SocialListeningRoom />
          </div>
        )}
      </div>
    </div>
  );
}
