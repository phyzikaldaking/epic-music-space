import type { Metadata } from "next";
import ViralFeed from "@/components/ViralFeed";

export const metadata: Metadata = {
  title: "Viral",
  description: "Discover what's blowing up on Epic Music Space. Watch trending tracks, viral battles, and chart dominators in real time. The hottest music moments, curated by the community.",
  openGraph: {
    title: "Viral",
    description: "Trending now on music's fastest-growing social platform. Viral tracks, fan battles, and chart climbers.",
    url: "https://epicmusicspace.com/viral",
  },
  alternates: { canonical: "https://epicmusicspace.com/viral" },
};

export default function ViralPage() {
  return <ViralFeed />;
}
