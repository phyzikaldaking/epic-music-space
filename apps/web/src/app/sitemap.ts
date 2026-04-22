import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";
import { prisma } from "@/lib/prisma";

const staticRoutes = [
  { path: "", priority: 1, changeFrequency: "daily" as const },
  { path: "/marketplace", priority: 0.95, changeFrequency: "hourly" as const },
  { path: "/pricing", priority: 0.8, changeFrequency: "weekly" as const },
  { path: "/leaderboard", priority: 0.75, changeFrequency: "daily" as const },
  { path: "/versus", priority: 0.75, changeFrequency: "hourly" as const },
  { path: "/auctions", priority: 0.72, changeFrequency: "hourly" as const },
  { path: "/label", priority: 0.65, changeFrequency: "weekly" as const },
  { path: "/legal/licensing", priority: 0.6, changeFrequency: "monthly" as const },
  { path: "/legal/terms", priority: 0.45, changeFrequency: "monthly" as const },
  { path: "/legal/privacy", priority: 0.45, changeFrequency: "monthly" as const },
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const now = new Date();

  const base: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: `${siteUrl}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  let songRoutes: MetadataRoute.Sitemap = [];
  let artistRoutes: MetadataRoute.Sitemap = [];

  try {
    const [songs, studios] = await Promise.all([
      prisma.song.findMany({
        where: { isActive: true },
        select: { id: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 5000,
      }),
      prisma.studio.findMany({
        select: { username: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 2000,
      }),
    ]);

    songRoutes = songs.map((s) => ({
      url: `${siteUrl}/track/${s.id}`,
      lastModified: s.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));

    artistRoutes = studios.map((a) => ({
      url: `${siteUrl}/studio/${a.username}`,
      lastModified: a.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
  } catch {
    // DB unavailable — return static routes only
  }

  return [...base, ...songRoutes, ...artistRoutes];
}

