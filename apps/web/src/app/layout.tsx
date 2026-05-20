import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Bebas_Neue, Orbitron, Audiowide } from "next/font/google";
import Providers from "@/components/Providers";
import FeedbackBotMount from "@/components/FeedbackBotMount";
import EMSWorldIntro from "@/components/EMSWorldIntro";
import { getSiteUrl } from "@/lib/site";
import "./globals.css";

const bebasNeue = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-bebas-neue",
  preload: false,
});

const orbitron = Orbitron({
  weight: ["500", "700", "900"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-orbitron",
  preload: false,
});

const audiowide = Audiowide({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-audiowide",
  preload: false,
});
const siteUrl = getSiteUrl();

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
const structuredDataJson = JSON.stringify(structuredData);

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
    default: "Epic Music Space | The Fastest-Growing Social Platform for Music",
    template: "%s | Epic Music Space",
  },
  description:
    "Connect with millions of fans, host live listening rooms, battle on leaderboards, and earn as you share. The social platform built for music creators and listeners.",
  keywords: [
    "music social media",
    "artist social network",
    "live listening rooms",
    "music community platform",
    "artist monetization",
    "independent music platform",
    "music discovery",
  ],
  openGraph: {
    title: "Epic Music Space | The Fastest-Growing Social Platform for Music",
    description:
      "Connect with fans, host live sessions, battle for chart dominance, and earn 100% from your music. The social platform where artists win.",
    url: siteUrl,
    siteName: "Epic Music Space",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Epic Music Space social media platform for music",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Epic Music Space | Music's Fastest-Growing Social Platform",
    description:
      "Connect with fans, host live rooms, compete in battles, and earn 100% from your music.",
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // CRITICAL — DO NOT REMOVE.
  // Pull the per-request nonce that proxy.ts set on the request headers.
  // Passing it to inline <script> tags is what lets CSP's 'strict-dynamic'
  // chain trust into Next.js's auto-injected flight-data scripts; without
  // this, hydration scripts get blocked and the page never becomes
  // interactive. This regression has shipped to production THREE times
  // now (most recently in 96f9769); see scripts/smoke-browser.mjs for the
  // synthetic that was supposed to catch it.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      className={`${bebasNeue.variable} ${orbitron.variable} ${audiowide.variable}`}
    >
      <body className="studio-room min-h-screen text-white antialiased" suppressHydrationWarning>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-md focus:bg-brand-500 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:outline-none focus:ring-2 focus:ring-accent-400"
        >
          Skip to main content
        </a>
        <script
          suppressHydrationWarning
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: structuredDataJson }}
        />
        <Providers>
          <EMSWorldIntro />
          {children}
          <FeedbackBotMount />
        </Providers>
      </body>
    </html>
  );
}
