import type { Metadata, Viewport } from "next";
import dynamic from "next/dynamic";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Providers from "@/components/Providers";
import CookieConsent from "@/components/CookieConsent";
import { ClientOnlyDynamics } from "@/components/ClientDynamics";
import { getSiteUrl } from "@/lib/site";

const siteUrl = getSiteUrl();
const GlobalAudioPlayer = dynamic(() => import("@/components/GlobalAudioPlayer"));
const OnboardingTour = dynamic(() => import("@/components/OnboardingTour"));
const KeyboardShortcuts = dynamic(() => import("@/components/KeyboardShortcuts"));
const MobileBottomNav = dynamic(() => import("@/components/MobileBottomNav"));
const OfflineBanner = dynamic(() => import("@/components/OfflineBanner"));

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // viewportFit=cover lets the layout extend behind the iPhone notch +
  // home indicator; components that care opt-in via env(safe-area-inset-*).
  // Player bar + mobile bottom-nav already do.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    { media: "(prefers-color-scheme: light)", color: "#0a0a0a" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "Epic Music Space",
  manifest: "/manifest.webmanifest",
  category: "music",
  creator: "Epic Music Space",
  publisher: "Epic Music Space",
  title: {
    default: "Epic Music Space | Live Listening Rooms for Artists",
    template: "%s | Epic Music Space",
  },
  description:
    "Host live listening rooms, upload independent music, and sell clear digital licenses from one artist studio.",
  keywords: [
    "live listening rooms",
    "artist listening party",
    "independent music licensing",
    "independent music marketplace",
    "artist studio platform",
  ],
  openGraph: {
    title: "Epic Music Space | Live Listening Rooms for Artists",
    description:
      "Host listening sessions, upload tracks, and sell clear digital licenses from one artist studio.",
    url: siteUrl,
    siteName: "Epic Music Space",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Epic Music Space live listening rooms for artists",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Epic Music Space | Live Listening Rooms for Artists",
    description:
      "Host listening sessions, upload tracks, and sell clear digital licenses from one artist studio.",
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: "/",
  },
  appleWebApp: {
    title: "Epic Music Space",
    capable: true,
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Epic Music Space",
      url: siteUrl,
      email: "legal@epicmusicspace.com",
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Epic Music Space",
      url: siteUrl,
      potentialAction: {
        "@type": "SearchAction",
        target: `${siteUrl}/marketplace?search={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
  ];

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Orbitron:wght@500;700;900&family=Audiowide&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-[#0a0a0a] text-white">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-md focus:bg-brand-500 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:outline-none focus:ring-2 focus:ring-accent-400"
        >
          Skip to main content
        </a>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <Providers>
          <Navbar />
          {/* Bottom-nav adds 56px on mobile so we pad <main> a bit more there. */}
          <main id="main-content" className="pb-32 md:pb-20">{children}</main>
          <Footer />
          <GlobalAudioPlayer />
          <OnboardingTour />
          <KeyboardShortcuts />
          <CookieConsent />
          <MobileBottomNav />
          <OfflineBanner />
          <ClientOnlyDynamics />
        </Providers>
      </body>
    </html>
  );
}
