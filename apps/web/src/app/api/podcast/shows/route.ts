import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimitInline";
import { PODCAST_CADENCES, PODCAST_FORMATS, slugifyPodcast } from "@/lib/podcast";

export const runtime = "nodejs";

const showSchema = z.object({
  title: z.string().min(3).max(120),
  tagline: z.string().max(160).optional().nullable(),
  description: z.string().min(20).max(5000),
  category: z.string().max(80).optional().nullable(),
  format: z.enum(PODCAST_FORMATS).default("VIDEO"),
  cadence: z.enum(PODCAST_CADENCES).default("WEEKLY"),
  coverUrl: z.string().url().optional().nullable(),
  bannerUrl: z.string().url().optional().nullable(),
  trailerAudioUrl: z.string().url().optional().nullable(),
  slug: z.string().min(3).max(80).optional(),
  isPublished: z.boolean().optional().default(false),
});

async function resolveShowSlug(baseInput: string) {
  const base = slugifyPodcast(baseInput);
  let candidate = base;
  let suffix = 2;
  while (await prisma.podcastShow.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${suffix++}`;
  }
  return candidate;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mine = url.searchParams.get("mine") === "1";

  if (mine) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const shows = await prisma.podcastShow.findMany({
      where: { ownerId: session.user.id },
      orderBy: [{ updatedAt: "desc" }],
      include: {
        episodes: {
          orderBy: [{ seasonNumber: "desc" }, { episodeNumber: "desc" }, { createdAt: "desc" }],
          take: 6,
        },
      },
    });
    return NextResponse.json({ shows });
  }

  const shows = await prisma.podcastShow.findMany({
    where: { isPublished: true },
    orderBy: [{ featured: "desc" }, { updatedAt: "desc" }],
    take: 24,
    include: {
      owner: { select: { id: true, name: true, image: true, username: true } },
      episodes: {
        where: { status: "PUBLISHED" },
        orderBy: { publishedAt: "desc" },
        take: 1,
        select: { id: true, title: true, slug: true, publishedAt: true, durationSec: true },
      },
      _count: { select: { episodes: true } },
    },
  });

  return NextResponse.json({ shows });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const blocked = await rateLimit("strict", `podcast:shows:create:${session.user.id}`);
  if (blocked) return blocked;

  const parsed = showSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  if (!user || user.role === "LISTENER") {
    return NextResponse.json({ error: "Creator accounts only." }, { status: 403 });
  }

  const slug = await resolveShowSlug(parsed.data.slug || parsed.data.title);

  const show = await prisma.podcastShow.create({
    data: {
      ownerId: session.user.id,
      title: parsed.data.title.trim(),
      tagline: parsed.data.tagline?.trim() || null,
      description: parsed.data.description.trim(),
      category: parsed.data.category?.trim() || null,
      format: parsed.data.format,
      cadence: parsed.data.cadence,
      coverUrl: parsed.data.coverUrl || null,
      bannerUrl: parsed.data.bannerUrl || null,
      trailerAudioUrl: parsed.data.trailerAudioUrl || null,
      isPublished: parsed.data.isPublished,
      slug,
    },
    select: { id: true, slug: true },
  });

  return NextResponse.json(show, { status: 201 });
}
