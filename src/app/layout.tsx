import type { Metadata } from "next";
import "./globals.css";
import { MainLayout } from "@/components/layout/MainLayout";
import { StarField } from "@/components/ui/StarField";
import { AuthProvider } from "@/hooks/useAuth";

export const metadata: Metadata = {
  title: "Epic Music Space — Your Cosmic Music Universe",
  description:
    "A next-generation music platform: upload, sell, bid, invest, and discover music from across the cosmos.",
  keywords: ["music", "space", "discovery", "playlist", "streaming", "marketplace"],
  openGraph: {
    title: "Epic Music Space",
    description: "Your cosmic music universe — upload, sell, discover",
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
        <AuthProvider>
          <MainLayout>{children}</MainLayout>
        </AuthProvider>
      </body>
    </html>
  );
}

