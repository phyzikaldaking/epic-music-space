import type { Metadata } from "next";
import BeatMachineSmartClient from "./BeatMachineSmartClient";

export const metadata: Metadata = {
  title: "EMS Smart MPC | Epic Music Space",
  description: "AI-assisted EMS Smart MPC with low-latency pads, sampler intelligence, tone guidance, frequency lanes, MIDI support, and beat production workflow.",
  openGraph: {
    title: "EMS Smart MPC",
    description: "Build beats with low-latency pads, AI sampler intelligence, tone guidance, frequency lanes, MIDI support, and loop export in Epic Music Space.",
    type: "website",
  },
};

export default function BeatMachinePage() {
  return <BeatMachineSmartClient />;
}
