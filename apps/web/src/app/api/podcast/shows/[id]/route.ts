import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PODCAST_CADENCES, PODCAST_FORMATS, slugifyPodcast } from "@/lib/podcast";

export const runtime = "nodejs";

const patchSchema = z.object({
  title: z.string().min(3).max(120).optional(),
  tagline: z.string().max(160).optional().nullable(),
  description: z.string().min(20).max(5000).optional(),
  category: z.string().max(80).optional().nullable(),
  format: z.enum(PODCAST_FORMATS).optional(),
  cadence: z.enum(PODCAST_CADENCES).optional(),
  coverUrl: z.string().url().optional().nullable(),
  bannerUrl: z.string().url().optional().nullable(),
  trailerAudioUrl: z.string().url().optional().nullable(),
  isPublished: z.boolean().optional(),
  featured: z.boolean().optional(),
  slug: z.string().min(3).max(80).optional(),
});

async function resolveShowSlug(showId: string, baseInput: string) {
  const base = slugifyPodcast(baseInput);
  let candidate = base;
  let suffix = 2;
  while (true) {
    const existing = await prisma.podcastShow.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing || existing.id === showId) return candidate;
    candidate = `${base}-${suffix++}`;
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const show = await prisma.podcastShow.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, image: true, username: true, role: true } },
      episodes: { orderBy: [{ seasonNumber: "desc" }, { episodeNumber: "desc" }, { createdAt: "desc" }] },
    },
  });
  if (!show) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!show.isPublished && show.ownerId !== session?.user?.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ show });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const show = await prisma.podcastShow.findUnique({ where: { id }, select: { ownerId: true } });
  if (!show) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (show.ownerId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const nextSlug = parsed.data.slug || parsed.data.title;
  const slug = nextSlug ? await resolveShowSlug(id, nextSlug) : undefined;

  const updated = await prisma.podcastShow.update({
    where: { id },
    data: {
      ...(parsed.data.title ? { title: parsed.data.title.trim() } : {}),
      ...(parsed.data.tagline !== undefined ? { tagline: parsed.data.tagline?.trim() || null } : {}),
      ...(parsed.data.description ? { description: parsed.data.description.trim() } : {}),
      ...(parsed.data.category !== undefined ? { category: parsed.data.category?.trim() || null } : {}),
      ...(parsed.data.format ? { format: parsed.data.format } : {}),
      ...(parsed.data.cadence ? { cadence: parsed.data.cadence } : {}),
      ...(parsed.data.coverUrl !== undefined ? { coverUrl: parsed.data.coverUrl || null } : {}),
      ...(parsed.data.bannerUrl !== undefined ? { bannerUrl: parsed.data.bannerUrl || null } : {}),
      ...(parsed.data.trailerAudioUrl !== undefined ? { trailerAudioUrl: parsed.data.trailerAudioUrl || null } : {}),
      ...(parsed.data.isPublished !== undefined ? { isPublished: parsed.data.isPublished } : {}),
      ...(parsed.data.featured !== undefined ? { featured: parsed.data.featured } : {}),
      ...(slug ? { slug } : {}),
    },
    select: { id: true, slug: true, isPublished: true },
  });

  return NextResponse.json(updated);
}
