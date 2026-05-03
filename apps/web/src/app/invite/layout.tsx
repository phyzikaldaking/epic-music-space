import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Invite Friends | Epic Music Space",
  description: "Invite friends to Epic Music Space and earn rewards. Unlock badges, ad credits, and subscription upgrades for every successful referral.",
};

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
