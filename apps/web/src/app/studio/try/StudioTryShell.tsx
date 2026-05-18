"use client";

import { useState } from "react";

import BeatMachineProClient from "../beat-machine/BeatMachineProClient";
import ElectricStudioWorkflow from "./ElectricStudioWorkflow";
import StudioCloudUploadPanel from "./StudioCloudUploadPanel";
import StudioControlFixPanel from "./StudioControlFixPanel";
import StudioMp3EncoderPanel from "./StudioMp3EncoderPanel";
import StudioReadinessPanel from "./StudioReadinessPanel";

type Workspace = "daw" | "controls" | "beat" | "cloud" | "mp3" | "ready";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const tabs: Array<{ id: Workspace; label: string; active: string; hover: string }> = [
  { id: "daw", label: "DAW", active: "bg-cyan-300 text-black", hover: "hover:bg-white/10 hover:text-cyan-100" },
  { id: "controls", label: "Controls", active: "bg-violet-300 text-black", hover: "hover:bg-white/10 hover:text-violet-100" },
  { id: "beat", label: "Beat", active: "bg-pink-300 text-black", hover: "hover:bg-white/10 hover:text-pink-100" },
  { id: "cloud", label: "Cloud", active: "bg-green-300 text-black", hover: "hover:bg-white/10 hover:text-green-100" },
  { id: "mp3", label: "MP3", active: "bg-orange-300 text-black", hover: "hover:bg-white/10 hover:text-orange-100" },
  { id: "ready", label: "Ready", active: "bg-yellow-300 text-black", hover: "hover:bg-white/10 hover:text-yellow-100" },
];

export default function StudioTryShell() {
  const [workspace, setWorkspace] = useState<Workspace>("daw");

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-[#05070a] text-white">
      <div className="absolute right-3 top-2 z-[80] flex items-center gap-1 rounded-full border border-white/10 bg-black/70 p-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/65 shadow-[0_10px_30px_rgba(0,0,0,.45)] backdrop-blur">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setWorkspace(tab.id)}
            className={cn(
              "rounded-full px-4 py-2 transition",
              workspace === tab.id ? tab.active : tab.hover
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {workspace === "daw" ? (
        <ElectricStudioWorkflow />
      ) : workspace === "controls" ? (
        <StudioControlFixPanel />
      ) : workspace === "beat" ? (
        <div className="h-dvh overflow-hidden bg-[#080a0f] pt-12">
          <div className="h-[calc(100dvh-3rem)] overflow-auto">
            <BeatMachineProClient studioMode />
          </div>
        </div>
      ) : workspace === "cloud" ? (
        <StudioCloudUploadPanel />
      ) : workspace === "mp3" ? (
        <StudioMp3EncoderPanel />
      ) : (
        <StudioReadinessPanel />
      )}
    </div>
  );
}
