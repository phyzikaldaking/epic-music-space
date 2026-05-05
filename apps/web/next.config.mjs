import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, "src");

const isDev = process.env.NODE_ENV !== "production";
const cspDirectives = [
  "default-src 'self'",
  isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com"
    : "script-src 'self' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://epicmusicspace.com https://www.epicmusicspace.com https://*.amazonaws.com https://*.supabase.co https://lh3.googleusercontent.com https://images.unsplash.com https://image.mux.com",
  "media-src 'self' blob: https://*.amazonaws.com https://*.supabase.co https://stream.mux.com https://*.mux.com",
  "connect-src 'self' https://*.supabase.co https://api.openai.com https://api.stripe.com https://checkout.stripe.com https://stream.mux.com https://*.mux.com https://*.litix.io",
  "frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com https://*.mux.com https://www.youtube.com https://player.vimeo.com https://w.soundcloud.com https://open.spotify.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com",
  "object-src 'none'",
  "font-src 'self' https://fonts.gstatic.com",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
];

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self), usb=(), xr-spatial-tracking=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: cspDirectives.join("; ") },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  outputFileTracingIncludes: { "/**": ["packages/db/generated/client/*.node"] },
  poweredByHeader: false,
  transpilePackages: ["@ems/utils"],
  experimental: { optimizePackageImports: ["@stripe/stripe-js", "openai"] },
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    remotePatterns: [
      { protocol: "https", hostname: "**.amazonaws.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "epicmusicspace.com" },
      { protocol: "https", hostname: "www.epicmusicspace.com" },
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "image.mux.com" },
      { protocol: "https", hostname: "stream.mux.com" },
    ],
  },
  webpack(config) {
    config.resolve.alias["@"] = srcDir;
    return config;
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

let exported = nextConfig;
try {
  const { withBotId } = await import("botid/next/config");
  exported = withBotId(exported);
} catch {}

if (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN) {
  try {
    const { withSentryConfig } = await import("@sentry/nextjs");
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
  } catch {}
}

export default exported;
