"use client";

import { useState } from "react";

import BeatMachineProClient from "../beat-machine/BeatMachineProClient";
import ElectricStudioWorkflow from "./ElectricStudioWorkflow";

type Workspace = "daw" | "beat";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function StudioTryShell() {
  const [workspace, setWorkspace] = useState<Workspace>("daw");

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-[#05070a] text-white">
      <div className="absolute right-3 top-2 z-[80] flex items-center gap-1 rounded-full border border-white/10 bg-black/70 p-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/65 shadow-[0_10px_30px_rgba(0,0,0,.45)] backdrop-blur">
        <button
          type="button"
          onClick={() => setWorkspace("daw")}
          className={cn(
            "rounded-full px-4 py-2 transition",
            workspace === "daw" ? "bg-cyan-300 text-black" : "hover:bg-white/10 hover:text-cyan-100"
          )}
        >
          DAW
        </button>
        <button
          type="button"
          onClick={() => setWorkspace("beat")}
          className={cn(
            "rounded-full px-4 py-2 transition",
            workspace === "beat" ? "bg-pink-300 text-black" : "hover:bg-white/10 hover:text-pink-100"
          )}
        >
          Beat
        </button>
      </div>

      {workspace === "daw" ? (
        <ElectricStudioWorkflow />
      ) : (
        <div className="h-dvh overflow-hidden bg-[#080a0f] pt-12">
          <div className="h-[calc(100dvh-3rem)] overflow-auto">
            <BeatMachineProClient studioMode />
          </div>
        </div>
      )}
    </div>
  );
}
