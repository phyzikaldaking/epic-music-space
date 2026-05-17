import type { Metadata } from "next";
import BeatMachineMidiSmartClient from "./BeatMachineMidiSmartClient";
import BeatMachinePluginHub from "./BeatMachinePluginHub";
import BeatMachineProducerAssistant from "./BeatMachineProducerAssistant";
import BeatMachineSmartExtractor from "./BeatMachineSmartExtractor";

export const metadata: Metadata = {
  title: "EMS Smart MPC | Epic Music Space",
  description: "AI-assisted EMS Smart MPC with producer assistant, loop-to-one-shot extraction, genre arrangement planning, audio analysis, low-latency pads, sampler intelligence, MIDI erase/undo/redo, Mac commands, plugin hub, Splice-ready sounds, VST bridge readiness, and beat production workflow.",
  openGraph: {
    title: "EMS Smart MPC",
    description: "Build beats with producer assistant, loop-to-one-shot extraction, audio analysis, genre arrangement planning, low-latency pads, MIDI editing, plugin hub, Splice-ready sounds, VST bridge readiness, and loop export in Epic Music Space.",
    type: "website",
  },
};

export default function BeatMachinePage() {
  return <main className="ems-smart-mpc-skin min-h-screen bg-[#030507] text-white">
    <BeatMachineMidiSmartClient />
    <BeatMachineProducerAssistant />
    <BeatMachineSmartExtractor />
    <BeatMachinePluginHub />
  </main>;
}
