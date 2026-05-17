import type { Metadata } from "next";
import FLBeatMachineClient from "./FLBeatMachineClient";

export const metadata: Metadata = {
  title: "EMS FL Beat Machine | Epic Music Space",
  description: "FL-style EMS beat machine with channel rack sequencing, pattern workflows, producer tools, exports, and AI-assisted beat creation.",
  openGraph: {
    title: "EMS FL Beat Machine",
    description: "Build beats with FL-style channel rack sequencing, pattern chaining, exports, groove tools, and producer workflows.",
    type: "website",
  },
};

export default function BeatMachinePage() {
  return (
    <main className="min-h-screen bg-[#030507] text-white">
      <FLBeatMachineClient />
    </main>
  );
}
