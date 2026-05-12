"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import {
  AIMasteringSlider,
  GenreEffectChains,
  SocialListeningRoom,
  TrendingSamplePacks,
} from "./PhaseFFeaturesComponents";

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

type Props = {
  projectName: string;
  projectId: string | null;
  userId: string | null;
  userName: string | null;
  focusedTrackId: string | null;
  projectKey: string | null;
  projectBpm: number | null;
};

export default function AIFeaturesHub({
  projectName,
  projectId,
  userId,
  userName,
  focusedTrackId,
  projectKey,
  projectBpm,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("tiktok");
  const safeProjectName = projectName?.trim() ? projectName.trim() : "Untitled session";
  const safeProjectKey = projectKey?.trim() ? projectKey.trim() : "C";
  const safeProjectBpm = typeof projectBpm === "number" && Number.isFinite(projectBpm) ? projectBpm : 120;

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
        {activeTab === "remix" && <RemixGenerator projectName={safeProjectName} />}
        {activeTab === "vibe" && <VibeMatchBrowser />}
        {activeTab === "harmonies" &&
          (focusedTrackId ? (
            <VocalHarmonyStacker trackId={focusedTrackId} />
          ) : (
            <div className="rounded-lg border border-white/10 bg-[#0c0c12] p-4 text-sm text-white/60">
              Select a track first to generate harmonies.
            </div>
          ))}
        {activeTab === "key-detect" &&
          (focusedTrackId ? (
            <VocalKeyDetection trackId={focusedTrackId} currentKey={safeProjectKey} />
          ) : (
            <div className="rounded-lg border border-white/10 bg-[#0c0c12] p-4 text-sm text-white/60">
              Select a track first to detect its key.
            </div>
          ))}
        {activeTab === "jam" &&
          (projectId && userId && userName ? (
            <LiveJamSessions projectId={projectId} userId={userId} userName={userName} />
          ) : (
            <div className="rounded-lg border border-white/10 bg-[#0c0c12] p-4 text-sm text-white/60">
              Sign in and save your project to start a jam session.
            </div>
          ))}
        {activeTab === "collab" &&
          (projectId && userId ? (
            <CollaborationDrafts projectId={projectId} userId={userId} />
          ) : (
            <div className="rounded-lg border border-white/10 bg-[#0c0c12] p-4 text-sm text-white/60">
              Sign in and save your project to leave comments.
            </div>
          ))}
        {activeTab === "loops" && (
          <SmartLoopSuggestions projectKey={safeProjectKey} projectBpm={safeProjectBpm} />
        )}
        {activeTab === "dna" && <DrumPatternDNAMixer />}
        {activeTab === "effects" && (
          <div className="space-y-3">
            <GenreEffectChains genre="trap" />
            <AIMasteringSlider />
            <TrendingSamplePacks />
            <SocialListeningRoom />
          </div>
        )}
      </div>
    </div>
  );
}
