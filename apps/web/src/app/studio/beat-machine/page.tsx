import type { Metadata } from "next";
import BeatMachineProClient from "./BeatMachineProClient";

export const metadata: Metadata = {
  title: "EMS Pro Beat Machine | Epic Music Space",
  description: "Engineer-grade EMS beat machine with pads, piano roll, sampler chopping, pattern sequencing, factory sounds, MIDI, exports, and AI-assisted beat creation.",
  openGraph: {
    title: "EMS Pro Beat Machine",
    description: "Build realistic beats with pads, piano roll sequencing, sampler chopping, factory sounds, MIDI, exports, and producer workflows.",
    type: "website",
  },
};

export default function BeatMachinePage() {
  return (
    <main className="min-h-screen bg-[#030507] text-white">
      <BeatMachineProClient />
    </main>
  );
}
