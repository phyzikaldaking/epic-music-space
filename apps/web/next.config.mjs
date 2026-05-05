import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, "src");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(self)",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // 'unsafe-inline'/'unsafe-eval' kept for Next.js dev + framework hydration.
      // Worth migrating to a nonce-based CSP in a follow-up; for now we keep
      // them consistent with current Next.js + Stripe.js requirements.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // img-src: data: needed for inline SVGs/posters; blob: for in-page
      // preview of files the user just selected (cover/avatar previews).
      // Mux poster thumbnails live on image.mux.com.
      "img-src 'self' data: blob: https://epicmusicspace.com https://www.epicmusicspace.com https://*.amazonaws.com https://*.supabase.co https://lh3.googleusercontent.com https://images.unsplash.com https://image.mux.com",
      // media-src: blob: required by Mux player's MSE-based HLS playback.
      // Stream proxies: own origin (audio proxy) + Mux video CDN.
      "media-src 'self' blob: https://*.amazonaws.com https://*.supabase.co https://stream.mux.com https://*.mux.com",
      // connect-src: add Mux stream + Mux Data analytics (litix.io).
      "connect-src 'self' https://*.supabase.co https://api.openai.com https://api.stripe.com https://checkout.stripe.com https://stream.mux.com https://*.mux.com https://*.litix.io",
      // frame-src: Stripe Checkout/Elements + Mux player iframe + supported
      // embeds we render via EmbeddedAudioPreview (YouTube/Vimeo/SoundCloud/Spotify).
      "frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com https://*.mux.com https://www.youtube.com https://player.vimeo.com https://w.soundcloud.com https://open.spotify.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
      "font-src 'self' https://fonts.gstatic.com",
      "worker-src 'self' blob:",
    ].join("; "),
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
    optimizePackageImports: ["@stripe/stripe-js", "openai"],
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
