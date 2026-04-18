import type { Metadata } from "next";
import "./globals.css";
import { MainLayout } from "@/components/layout/MainLayout";
import { StarField } from "@/components/ui/StarField";

export const metadata: Metadata = {
  title: "Epic Music Space — Your Cosmic Music Universe",
  description:
    "An immersive music discovery platform with a space-themed experience. Explore tracks, artists, and albums from across the cosmos.",
  keywords: ["music", "space", "discovery", "playlist", "streaming"],
  openGraph: {
    title: "Epic Music Space",
    description: "Your cosmic music universe",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full nebula-bg">
        <StarField />
        <MainLayout>{children}</MainLayout>
      </body>
    </html>
  );
}
