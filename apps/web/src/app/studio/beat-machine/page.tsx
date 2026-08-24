import type { Metadata } from "next";
import OfficialKitBeatMachineStudio from "./OfficialKitBeatMachineStudio";

export const metadata: Metadata = {
  title: "EMS Beat Machine | Epic Music Space",
  description: "Standalone EMS beat machine inside the studio flow with pads, sampler, piano roll, sounds, mixer, arrangement, exports, and AI presets.",
};

export default function BeatMachineStudioPage() {
  return <OfficialKitBeatMachineStudio />;
}
