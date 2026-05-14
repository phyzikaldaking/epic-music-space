import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Bebas_Neue, Orbitron, Audiowide } from "next/font/google";
import Providers from "@/components/Providers";
import PublicFooter from "@/components/PublicFooter";
import { getSiteUrl } from "@/lib/site";
import "./globals.css";
import "./ems-overrides.css";

const bebasNeue = Bebas_Neue({ weight: "400", subsets: ["latin"], display: "swap", variable: "--font-bebas-neue", preload: false });
const orbitron = Orbitron({ weight: ["500", "700", "900"], subsets: ["latin"], display: "swap", variable: "--font-orbitron", preload: false });
const audiowide = Audiowide({ weight: "400", subsets: ["latin"], display: "swap", variable: "--font-audiowide", preload: false });
const siteUrl = getSiteUrl();

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Epic Music Space",
    alternateName: "EMS",
    url: siteUrl,
    email: "legal@epicmusicspace.com",
    sameAs: ["https://www.epicmusicspace.com"],
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Epic Music Space",
    url: siteUrl,
    potentialAction: { "@type": "SearchAction", target: `${siteUrl}/marketplace?search={search_term_string}`, "query-input": "required name=search_term_string" },
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Epic Music Space Studio",
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web",
    url: `${siteUrl}/studio/try`,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  },
];
const structuredDataJson = JSON.stringify(structuredData);

export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 5, viewportFit: "cover", themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#12051f" }, { media: "(prefers-color-scheme: light)", color: "#12051f" }] };

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "Epic Music Space",
  manifest: "/manifest.webmanifest",
  category: "music",
  creator: "Epic Music Space",
  publisher: "Epic Music Space",
  title: { default: "Epic Music Space | Music Creation, Collaboration, Licensing & Discovery", template: "%s | Epic Music Space" },
  description: "Create music, collaborate live, sell services, license sounds, host rooms, battle on leaderboards, and grow a fanbase inside one studio-grade music platform.",
  keywords: ["music collaboration platform", "online music studio", "beat machine", "artist marketplace", "live studio video", "music licensing", "producer services", "independent artist platform", "music discovery"],
  openGraph: {
    title: "Epic Music Space | Create, Collab, License, and Grow",
    description: "A studio-grade platform where artists, producers, engineers, and fans create, collaborate, sell services, license sounds, and discover music.",
    url: siteUrl,
    siteName: "Epic Music Space",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Epic Music Space music creation and collaboration platform" }],
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Epic Music Space | Create, Collab, License, and Grow", description: "Build music, host rooms, collaborate live, sell services, and grow your fanbase.", images: ["/opengraph-image"] },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  formatDetection: { email: false, address: false, telephone: false },
  alternates: { canonical: "/" },
  appleWebApp: { title: "Epic Music Space", capable: true, statusBarStyle: "black-translucent" },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" className={`${bebasNeue.variable} ${orbitron.variable} ${audiowide.variable}`}>
      <body className="studio-room min-h-screen text-white antialiased" suppressHydrationWarning>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-md focus:bg-brand-500 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:outline-none focus:ring-2 focus:ring-accent-400">Skip to main content</a>
        <script suppressHydrationWarning nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredDataJson }} />
        <Providers>
          {children}
          <PublicFooter />
        </Providers>
      </body>
    </html>
  );
}
