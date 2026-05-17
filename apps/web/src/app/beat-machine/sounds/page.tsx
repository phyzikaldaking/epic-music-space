import type { Metadata } from "next";
import BeatMachineProClient from "../../studio/beat-machine/BeatMachineProClient";

export const metadata: Metadata = {
  title: "EMS Beat Machine Sounds | Epic Music Space",
  description: "Sounds, kits, loops, extracted one-shots, uploads, and saved custom kits for the EMS Beat Machine.",
};

export default function BeatMachineSoundsPage() {
  return <BeatMachineProClient initialView="sounds" />;
}
