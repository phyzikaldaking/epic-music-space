import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Invite Friends",
  description: "Invite friends to music's fastest-growing social platform and earn rewards. Unlock badges, ad credits, and subscription upgrades for every friend who joins the community.",
    alternates: { canonical: "/invite" },
};

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
