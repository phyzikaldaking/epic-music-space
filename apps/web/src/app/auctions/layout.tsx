import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Auctions | Epic Music Space",
  description: "Bid on exclusive track licenses in live auctions. Win unique music rights from independent artists on Epic Music Space.",
};

export default function AuctionsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
