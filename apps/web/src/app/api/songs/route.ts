import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createSongSchema = z.object({
  title: z.string().min(1).max(200),
  artist: z.string().min(1).max(200),
  genre: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  audioUrl: z.string().url(),
  coverUrl: z.string().url().optional(),
  bpm: z.coerce.number().int().min(20).max(999).optional(),
  key: z.string().max(10).optional(),
  licensePrice: z.coerce.number().min(0.5).max(100000),
  revenueSharePct: z.coerce.number().min(0.01).max(100),
  totalLicenses: z.coerce.number().int().min(1).max(10000).default(100),
});

export async function GET() {
  const songs = await prisma.song.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(songs);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.role === "LISTENER") {
    return NextResponse.json(
      { error: "Only artists can upload songs." },
      { status: 403 }
    );
  }

  const body = await req.json();
  const parsed = createSongSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const song = await prisma.song.create({
    data: {
      ...parsed.data,
      artistId: session.user.id,
    },
  });

  return NextResponse.json(song, { status: 201 });
}
