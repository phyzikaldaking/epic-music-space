import type { Metadata } from "next";
import ViralFeed from "@/components/ViralFeed";

export const metadata: Metadata = {
  title: "Viral",
  description: "The hottest tracks blowing up right now on Epic Music Space. Fan-curated viral music moments, battles, and drops.",
  openGraph: {
    title: "Viral",
    description: "The hottest tracks blowing up right now — fan-curated viral music moments.",
    url: "https://epicmusicspace.com/viral",
  },
  alternates: { canonical: "https://epicmusicspace.com/viral" },
};

export default function ViralPage() {
  return <ViralFeed />;
}
