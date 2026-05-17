import type { Metadata } from "next";
import BeatMachineMidiSmartClient from "./BeatMachineMidiSmartClient";
import BeatMachinePluginHub from "./BeatMachinePluginHub";
import BeatMachineProducerAssistant from "./BeatMachineProducerAssistant";

export const metadata: Metadata = {
  title: "EMS Smart MPC | Epic Music Space",
  description: "AI-assisted EMS Smart MPC with producer assistant, genre arrangement planning, audio analysis, low-latency pads, sampler intelligence, MIDI erase/undo/redo, Mac commands, plugin hub, Splice-ready sounds, VST bridge readiness, and beat production workflow.",
  openGraph: {
    title: "EMS Smart MPC",
    description: "Build beats with producer assistant, audio analysis, genre arrangement planning, low-latency pads, MIDI editing, plugin hub, Splice-ready sounds, VST bridge readiness, and loop export in Epic Music Space.",
    type: "website",
  },
};

export default function BeatMachinePage() {
  return <>
    <BeatMachinePluginHub />
    <BeatMachineProducerAssistant />
    <BeatMachineMidiSmartClient />
  </>;
}
