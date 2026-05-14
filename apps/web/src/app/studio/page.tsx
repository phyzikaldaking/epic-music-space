import type { Metadata } from "next";
import ElectricStudio from "./try/ElectricStudio";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Studio",
  description: "A full-screen electric EMS DAW workspace with timeline editing, mixer controls, beat pads, melody tracks, FX rack, and recording tools.",
};

export default function StudioIndexPage() {
  return <ElectricStudio />;
}
