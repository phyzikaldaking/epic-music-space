import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Auctions | Epic Music Space",
  description: "Bid on exclusive music in live auctions. Compete with the community, win unique track rights, and discover emerging artists on music's fastest-growing social platform.",
};

export default function AuctionsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
