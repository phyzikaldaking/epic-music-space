import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "EMS Beat Machine Sounds | Epic Music Space",
  description: "Sounds, kits, loops, extracted one-shots, uploads, and saved custom kits for the EMS Beat Machine.",
};

export default function BeatMachineSoundsPage() {
  redirect("/studio?mode=beat");
}
