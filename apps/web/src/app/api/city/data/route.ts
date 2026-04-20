import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export type CityBuilding = {
  username: string;
  name: string;
  image: string | null;
  district: "LABEL_ROW" | "DOWNTOWN_PRIME" | "INDIE_BLOCKS";
  level: number;
  avgScore: number;
  songCount: number;
  totalSold: number;
};

export type CityApiData = {
  buildings: CityBuilding[];
};

type StudioRow = {
  username: string;
  district: string;
  level: number;
  user: {
    name: string | null;
    image: string | null;
    songs: { aiScore: number; soldLicenses: number }[];
  };
};

export async function GET() {
  const studios = await prisma.studio.findMany({
    take: 60,
    orderBy: { level: "desc" },
    select: {
      username: true,
      district: true,
      level: true,
      user: {
        select: {
          name: true,
          image: true,
          songs: {
            where: { isActive: true },
            select: { aiScore: true, soldLicenses: true },
          },
        },
      },
    },
  });

  const buildings: CityBuilding[] = (studios as StudioRow[]).map((s) => {
    const songs = s.user.songs;
    const avgScore =
      songs.length > 0
        ? songs.reduce((acc: number, x: { aiScore: number; soldLicenses: number }) => acc + x.aiScore, 0) / songs.length
        : 0;
    const totalSold = songs.reduce((acc: number, x: { aiScore: number; soldLicenses: number }) => acc + x.soldLicenses, 0);
    return {
      username: s.username,
      name: s.user.name ?? s.username,
      image: s.user.image,
      district: s.district as CityBuilding["district"],
      level: s.level,
      avgScore: Math.round(avgScore * 10) / 10,
      songCount: songs.length,
      totalSold,
    };
  });

  return NextResponse.json({ buildings } satisfies CityApiData);
}
