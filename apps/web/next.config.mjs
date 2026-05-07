import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, "src");

// CSP frame-ancestors 'none' (set in middleware) is the modern equivalent;
// X-Frame-Options DENY is belt-and-suspenders for legacy clients. Stripe
// Checkout / OAuth popups need same-origin-allow-popups (not same-origin) to
// open and post back. The Permissions-Policy denies every powerful API we
// don't use and self-allows camera/mic for creator recording flows.
const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
  { key: "Origin-Agent-Cluster", value: "?1" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: [
      "accelerometer=()",
      "autoplay=(self)",
      "browsing-topics=()",
      "camera=(self)",
      "display-capture=()",
      "encrypted-media=(self)",
      "fullscreen=(self)",
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=(self)",
      "midi=()",
      "payment=(self)",
      "picture-in-picture=(self)",
      "publickey-credentials-get=(self)",
      "screen-wake-lock=()",
      "sync-xhr=()",
      "usb=()",
      "xr-spatial-tracking=(self)",
    ].join(", "),
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  outputFileTracingIncludes: {
    "/**": ["packages/db/generated/client/*.node"],
  },
  poweredByHeader: false,
  transpilePackages: ["@ems/utils"],
  // Keep build stability first for deployment. This optimization can
  // regress build reliability on some dependency graphs.
  experimental: {},
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 365,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;" ,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "epicmusicspace.com",
      },
      {
        protocol: "https",
        hostname: "www.epicmusicspace.com",
      },
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        // Mux thumbnail/static-renditions for video posts
        protocol: "https",
        hostname: "image.mux.com",
      },
      {
        protocol: "https",
        hostname: "stream.mux.com",
      },
    ],
  },
  webpack(config, { dev }) {
    config.resolve.alias["@"] = srcDir;
    if (dev) {
      config.cache = false;
    }
    config.ignoreWarnings = config.ignoreWarnings ?? [];
    config.ignoreWarnings.push({
      module:
        /@prisma\/instrumentation\/node_modules\/@opentelemetry\/instrumentation\/build\/esm\/platform\/node\/instrumentation\.js/,
      message: /Critical dependency: the request of a dependency is an expression/,
    });
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      // Auth pages: no-cache + revalidate every request (prevent stale sign-in)
      {
        source: "/auth/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
      // Performance hints: preconnect to critical third-party origins so the
      // browser can warm up the TCP/TLS handshake while the HTML is still
      // streaming. Saves 100-300ms on first byte for fonts/Stripe.
      {
        source: "/(.*)",
        headers: [
          {
            key: "Link",
            value: [
              "<https://fonts.googleapis.com>; rel=preconnect",
              "<https://fonts.gstatic.com>; rel=preconnect; crossorigin",
              "<https://cdn.jsdelivr.net>; rel=preconnect",
              "<https://api.stripe.com>; rel=preconnect",
            ].join(", "),
          },
        ],
      },
    ];
  },
};

// BotID — wrap the routes that should be challenged. Empty path list keeps
// the runtime headers wired so checkBotId() server-side calls work, while
// individual routes are responsible for actually invoking the check.
let exported = nextConfig;
try {
  const { withBotId } = await import("botid/next/config");
  exported = withBotId(exported);
} catch {
  // botid not installed — fall through.
}

if (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN) {
  try {
    const { withSentryConfig } = await import("@sentry/nextjs");
    // Wrap the already-BotID-wrapped config (if any) so both plugins'
    // settings stack rather than clobbering each other.
    exported = withSentryConfig(exported, {
      silent: true,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      widenClientFileUpload: true,
      hideSourceMaps: true,
      disableLogger: true,
      automaticVercelMonitors: false,
    });
  } catch {
    // @sentry/nextjs not installed at build time — fall through.
  }
}

export default exported;
