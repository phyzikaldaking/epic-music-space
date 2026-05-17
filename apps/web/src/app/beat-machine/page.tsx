import type { Metadata } from "next";
import FLBeatMachineClient from "../studio/beat-machine/FLBeatMachineClient";

export const metadata: Metadata = {
  title: "EMS V Machine | Epic Music Space",
  description: "FL-style V Machine beat screen with channel rack sequencing, pattern buttons, templates, rolls, exports, and producer workflow.",
};

export default function PublicBeatMachinePage() {
  return (
    <main className="min-h-screen bg-[#030507] text-white">
      <FLBeatMachineClient />
    </main>
  );
}
