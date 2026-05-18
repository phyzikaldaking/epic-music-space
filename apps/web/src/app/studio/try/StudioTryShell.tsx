"use client";

import { useState } from "react";

import BeatMachineProClient from "../beat-machine/BeatMachineProClient";
import ElectricStudioRoutingDaw from "./ElectricStudioRoutingDaw";
import StudioCloudUploadPanel from "./StudioCloudUploadPanel";
import StudioControlFixPanel from "./StudioControlFixPanel";
import StudioMp3EncoderPanel from "./StudioMp3EncoderPanel";
import StudioReadinessPanel from "./StudioReadinessPanel";

type Workspace = "daw" | "controls" | "beat" | "cloud" | "mp3" | "ready";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const tabs: Array<{ id: Workspace; label: string; short: string; active: string; hover: string }> = [
  { id: "daw", label: "DAW", short: "DAW", active: "bg-cyan-300 text-black", hover: "hover:bg-white/10 hover:text-cyan-100" },
  { id: "controls", label: "Controls", short: "Ctrl", active: "bg-violet-300 text-black", hover: "hover:bg-white/10 hover:text-violet-100" },
  { id: "beat", label: "Beat", short: "Beat", active: "bg-pink-300 text-black", hover: "hover:bg-white/10 hover:text-pink-100" },
  { id: "cloud", label: "Cloud", short: "Cloud", active: "bg-green-300 text-black", hover: "hover:bg-white/10 hover:text-green-100" },
  { id: "mp3", label: "MP3", short: "MP3", active: "bg-orange-300 text-black", hover: "hover:bg-white/10 hover:text-orange-100" },
  { id: "ready", label: "Ready", short: "Ready", active: "bg-yellow-300 text-black", hover: "hover:bg-white/10 hover:text-yellow-100" },
];

export default function StudioTryShell() {
  const [workspace, setWorkspace] = useState<Workspace>("daw");

  return (
    <div className="relative h-[100svh] w-full overflow-hidden bg-[#05070a] text-white md:h-dvh">
      <div className="fixed bottom-2 left-2 right-2 z-[80] flex max-w-[calc(100vw-1rem)] items-center gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-black/82 p-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/65 shadow-[0_10px_30px_rgba(0,0,0,.55)] backdrop-blur md:absolute md:bottom-auto md:left-auto md:right-3 md:top-2 md:max-w-none md:rounded-full md:bg-black/70 md:tracking-[0.14em]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setWorkspace(tab.id)}
            className={cn(
              "min-h-10 shrink-0 rounded-full px-3 py-2 transition md:min-h-0 md:px-4",
              workspace === tab.id ? tab.active : tab.hover
            )}
          >
            <span className="md:hidden">{tab.short}</span>
            <span className="hidden md:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="h-full overflow-hidden pb-16 md:pb-0">
        {workspace === "daw" ? (
          <ElectricStudioRoutingDaw />
        ) : workspace === "controls" ? (
          <StudioControlFixPanel />
        ) : workspace === "beat" ? (
          <div className="h-full overflow-hidden bg-[#080a0f] pt-10 md:h-dvh md:pt-12">
            <div className="h-full overflow-auto md:h-[calc(100dvh-3rem)]">
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
    </div>
  );
}
