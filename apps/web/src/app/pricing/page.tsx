import type { Metadata } from "next";
import PricingClient from "./PricingClient";

export const metadata: Metadata = {
  title: "Pricing | Epic Music Space",
  description: "Choose an Epic Music Space plan for listening, uploading, licensing, live rooms, battles, AI scoring, and label growth.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Epic Music Space Pricing",
    description: "Plans for listeners, artists, teams, and labels building on Epic Music Space.",
    url: "/pricing",
  },
};

export default function PricingPage() {
  return <PricingClient />;
}
