import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const upsertSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, - and _"),
  bio: z.string().max(500).optional(),
  bannerUrl: z.string().url().optional(),
  socialLinks: z
    .object({
      twitter: z.string().url().optional(),
      instagram: z.string().url().optional(),
      spotify: z.string().url().optional(),
    })
    .optional(),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username");

  if (username) {
    const studio = await prisma.studio.findUnique({
      where: { username },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
            role: true,
            songs: {
              where: { isActive: true },
              orderBy: { aiScore: "desc" },
              take: 20,
            },
            _count: { select: { followers: true, following: true } },
          },
        },
      },
    });
    if (!studio) {
      return NextResponse.json({ error: "Studio not found" }, { status: 404 });
    }
    return NextResponse.json(studio);
  }

  // List all studios (discovery)
  const studios = await prisma.studio.findMany({
    include: {
      user: { select: { name: true, image: true, _count: { select: { followers: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(studios);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const { username, bio, bannerUrl, socialLinks } = parsed.data;

  // Check username uniqueness (excluding current user)
  const existing = await prisma.studio.findFirst({
    where: { username, userId: { not: session.user.id } },
  });
  if (existing) {
    return NextResponse.json({ error: "Username is already taken." }, { status: 409 });
  }

  const studio = await prisma.studio.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, username, bio, bannerUrl, socialLinks },
    update: { username, bio, bannerUrl, socialLinks },
  });

  return NextResponse.json(studio);
}
