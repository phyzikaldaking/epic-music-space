import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "songs";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);

  if (type === "artists") {
    // Top artists by total licenses sold across all their songs
    const artists = await prisma.user.findMany({
      where: { role: { in: ["ARTIST", "LABEL"] } },
      select: {
        id: true,
        name: true,
        image: true,
        studio: { select: { username: true, district: true } },
        songs: {
          where: { isActive: true },
          select: { soldLicenses: true, aiScore: true },
        },
        _count: { select: { followers: true } },
      },
      take: limit * 3, // over-fetch then sort
    });

    const ranked = artists
      .map((a) => ({
        id: a.id,
        name: a.name,
        image: a.image,
        username: a.studio?.username,
        district: a.studio?.district,
        totalLicensesSold: a.songs.reduce((s, x) => s + x.soldLicenses, 0),
        avgAiScore:
          a.songs.length > 0
            ? a.songs.reduce((s, x) => s + x.aiScore, 0) / a.songs.length
            : 0,
        followers: a._count.followers,
        songCount: a.songs.length,
      }))
      .sort((a, b) => b.totalLicensesSold - a.totalLicensesSold)
      .slice(0, limit);

    return NextResponse.json(ranked);
  }

  // Default: top songs by AI score
  const songs = await prisma.song.findMany({
    where: { isActive: true },
    orderBy: [{ aiScore: "desc" }, { soldLicenses: "desc" }],
    take: limit,
    select: {
      id: true,
      title: true,
      artist: true,
      genre: true,
      coverUrl: true,
      licensePrice: true,
      revenueSharePct: true,
      soldLicenses: true,
      totalLicenses: true,
      aiScore: true,
      district: true,
      versusWins: true,
    },
  });

  return NextResponse.json(songs);
}
