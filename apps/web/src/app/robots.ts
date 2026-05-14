import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/studio/try", "/marketplace", "/rooms", "/versus", "/how-licenses-work"],
        disallow: [
          "/dashboard",
          "/analytics",
          "/notifications",
          "/profile/",
          "/api/",
          "/auth/",
          "/boost",
          "/ads",
          "/invite",
          "/messages",
          "/messages/",
          "/settings",
          "/settings/",
          "/admin",
          "/admin/",
          "/me",
          "/studio/manage",
          "/studio/live",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
