import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";
import { prisma } from "@/lib/prisma";

const staticRoutes = [
  { path: "", priority: 1, changeFrequency: "daily" as const },
  { path: "/marketplace", priority: 0.95, changeFrequency: "hourly" as const },
  { path: "/pricing", priority: 0.8, changeFrequency: "weekly" as const },
  { path: "/leaderboard", priority: 0.75, changeFrequency: "daily" as const },
  { path: "/versus", priority: 0.75, changeFrequency: "hourly" as const },
  { path: "/verzuz", priority: 0.75, changeFrequency: "hourly" as const },
  { path: "/auctions", priority: 0.72, changeFrequency: "hourly" as const },
  { path: "/label", priority: 0.65, changeFrequency: "weekly" as const },
  { path: "/studio/live", priority: 0.7, changeFrequency: "hourly" as const },
  { path: "/rooms", priority: 0.65, changeFrequency: "hourly" as const },
  { path: "/trending", priority: 0.6, changeFrequency: "daily" as const },
  { path: "/feed", priority: 0.7, changeFrequency: "hourly" as const },
  { path: "/services", priority: 0.65, changeFrequency: "daily" as const },
  { path: "/explore", priority: 0.55, changeFrequency: "daily" as const },
  { path: "/search", priority: 0.5, changeFrequency: "weekly" as const },
  { path: "/license-agreement", priority: 0.6, changeFrequency: "monthly" as const },
  { path: "/terms", priority: 0.45, changeFrequency: "monthly" as const },
  { path: "/privacy", priority: 0.45, changeFrequency: "monthly" as const },
  { path: "/dmca", priority: 0.4, changeFrequency: "monthly" as const },
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
  let versusRoutes: MetadataRoute.Sitemap = [];
  let verzuzRoutes: MetadataRoute.Sitemap = [];

  try {
    const [songs, studios, versusMatches, verzuzMatches] = await Promise.all([
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
      prisma.versusMatch.findMany({
        where: { status: "COMPLETED" },
        select: { id: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1000,
      }).catch(() => [] as { id: string; createdAt: Date }[]),
      prisma.verzuzMatch.findMany({
        where: { status: { in: ["LIVE", "COMPLETED"] } },
        select: { id: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 500,
      }).catch(() => [] as { id: string; createdAt: Date }[]),
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

    versusRoutes = versusMatches.map((v) => ({
      url: `${siteUrl}/versus/${v.id}`,
      lastModified: v.createdAt,
      changeFrequency: "never" as const,
      priority: 0.55,
    }));

    verzuzRoutes = verzuzMatches.map((v) => ({
      url: `${siteUrl}/verzuz/${v.id}`,
      lastModified: v.createdAt,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    }));
  } catch {
    // DB unavailable — return static routes only
  }

  return [...base, ...songRoutes, ...artistRoutes, ...versusRoutes, ...verzuzRoutes];
}

