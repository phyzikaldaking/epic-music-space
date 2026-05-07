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
  experimental: {
    optimizePackageImports: [
      "@stripe/stripe-js",
      "openai",
      "@mux/mux-player-react",
      "livekit-client",
      "@sentry/nextjs",
      "@supabase/supabase-js",
    ],
  },
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
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
  webpack(config) {
    config.resolve.alias["@"] = srcDir;
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
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
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
