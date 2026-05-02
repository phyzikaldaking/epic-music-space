import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Providers from "@/components/Providers";
import { getSiteUrl } from "@/lib/site";

const siteUrl = getSiteUrl();

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "Epic Music Space",
  manifest: "/manifest.webmanifest",
  category: "music",
  creator: "Epic Music Space",
  publisher: "Epic Music Space",
  title: {
    default: "Epic Music Space | Cinematic Music Licensing",
    template: "%s | Epic Music Space",
  },
  description:
    "License cinematic space music, preview independent tracks, and review clear digital music licensing terms before checkout.",
  keywords: [
    "epic space music",
    "cinematic music licensing",
    "sci-fi trailer music",
    "independent music marketplace",
    "game music licensing",
  ],
  openGraph: {
    title: "Epic Music Space | Cinematic Music Licensing",
    description:
      "Preview and license cinematic independent music with clear digital rights terms.",
    url: siteUrl,
    siteName: "Epic Music Space",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Epic Music Space cinematic music licensing",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Epic Music Space | Cinematic Music Licensing",
    description:
      "Preview and license cinematic independent music with clear digital rights terms.",
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
          <main id="main-content">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
