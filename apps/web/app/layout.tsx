import type { Metadata } from "next";
import { Inter, Sora } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Epic Music Space — The Digital City for Artists",
    template: "%s | Epic Music Space",
  },
  description:
    "EMS is a monetized attention economy for music artists. Own studios, buy billboard visibility, sell beats, and compete for attention in a digital city.",
  keywords: ["music", "artist", "beats", "digital city", "music marketplace", "studio"],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://epicmusicspace.com",
    siteName: "Epic Music Space",
    title: "Epic Music Space — The Digital City for Artists",
    description: "Own your studio. Buy visibility. Dominate the city.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Epic Music Space",
    description: "Own your studio. Buy visibility. Dominate the city.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${sora.variable} dark`}>
      <body className="bg-ems-black text-ems-text antialiased">
        {children}
      </body>
    </html>
  );
}
