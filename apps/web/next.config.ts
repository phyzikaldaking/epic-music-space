import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // required for next-auth v5 server actions
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
