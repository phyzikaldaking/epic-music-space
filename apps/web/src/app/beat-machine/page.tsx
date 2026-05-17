import type { Metadata } from "next";
import BeatMachineProClient from "../studio/beat-machine/BeatMachineProClient";

export const metadata: Metadata = {
  title: "EMS Pro Beat Machine | Epic Music Space",
  description: "Engineer-grade beat machine with pads, piano roll, sampler chopping, pattern sequencing, factory sounds, MIDI, exports, and producer workflow.",
};

export default function PublicBeatMachinePage() {
  return (
    <main className="min-h-screen bg-[#030507] text-white">
      <BeatMachineProClient />
    </main>
  );
}
