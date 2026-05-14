import type { Metadata } from "next";
import BeatMachineClient from "./BeatMachineClient";

export const metadata: Metadata = {
  title: "EMS Beat Machine | Epic Music Space",
  description: "Dedicated EMS Beat Machine with 16-step sequencing, pattern tools, MIDI support, loop export, and arrangement workflow.",
  openGraph: {
    title: "EMS Beat Machine",
    description: "Build beats with pads, instruments, pattern tools, MIDI support, and loop export in Epic Music Space.",
    type: "website",
  },
};

export default function BeatMachinePage() {
  return <BeatMachineClient />;
}
