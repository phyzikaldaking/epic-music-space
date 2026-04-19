/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@ems/ui", "@ems/db"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "**.supabase.in" },
    ],
  },
};

module.exports = nextConfig;
