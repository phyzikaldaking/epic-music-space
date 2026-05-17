import type { Metadata } from "next";
import BeatMachineProClient from "../../studio/beat-machine/BeatMachineProClient";

export const metadata: Metadata = {
  title: "EMS Beat Machine Sampler | Epic Music Space",
  description: "Sampler, waveform chopping, one-shot extraction, pad assignment, and smart sample analysis for the EMS Beat Machine.",
};

export default function BeatMachineSamplerPage() {
  return <BeatMachineProClient initialView="sampler" />;
}
