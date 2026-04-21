import type { Metadata } from "next";
import { Inter, Barlow_Condensed } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Epic Music Space — Digital Music Licensing Platform",
  description:
    "License music. Earn revenue. Participate in the future of independent music distribution.",
  openGraph: {
    title: "Epic Music Space",
    description: "Digital Music Licensing + Revenue Participation Platform",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${barlowCondensed.variable}`}>
      <body className="min-h-screen bg-[#080808] text-white antialiased">
        <Navbar />
        <main>{children}</main>
        <footer className="relative border-t border-white/8 py-16 text-sm text-white/40 overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-brand-900/20 to-transparent" />
          <div className="relative mx-auto max-w-7xl px-4">
            <div className="mb-10 flex flex-col items-center gap-3">
              <span className="text-2xl font-display font-black tracking-widest text-gradient-ems uppercase">
                Epic Music Space
              </span>
              <p className="max-w-sm text-center text-white/30 text-xs">
                The future of independent music. Own your sound, own your city.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-8 mb-8">
              {[
                { label: "Marketplace", href: "/marketplace" },
                { label: "Versus", href: "/versus" },
                { label: "City", href: "/city" },
                { label: "Charts", href: "/leaderboard" },
                { label: "Labels", href: "/label" },
                { label: "Pricing", href: "/pricing" },
              ].map((l) => (
                <a key={l.href} href={l.href} className="hover:text-white transition-colors">
                  {l.label}
                </a>
              ))}
            </div>
            <div className="border-t border-white/8 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p>© {new Date().getFullYear()} Epic Music Space, LLC. All rights reserved.</p>
              <div className="flex gap-6">
                <a href="/legal/terms" className="hover:text-white/80 transition-colors">Terms</a>
                <a href="/legal/privacy" className="hover:text-white/80 transition-colors">Privacy</a>
                <a href="/legal/licensing" className="hover:text-white/80 transition-colors">Licensing</a>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
