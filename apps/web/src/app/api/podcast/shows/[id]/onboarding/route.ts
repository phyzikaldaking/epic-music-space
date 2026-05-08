import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const stepSchema = z.object({
  profileReady: z.boolean(),
  firstShowCreated: z.boolean(),
  firstEpisodeCreated: z.boolean(),
  firstMediaAttached: z.boolean(),
  firstPublish: z.boolean(),
});

const updateSchema = z.object({
  steps: stepSchema,
});

function defaultSteps() {
  return {
    profileReady: false,
    firstShowCreated: false,
    firstEpisodeCreated: false,
    firstMediaAttached: false,
    firstPublish: false,
  };
}

function mergeOnboarding(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return defaultSteps();
  const value = input as Partial<ReturnType<typeof defaultSteps>>;
  return {
    profileReady: Boolean(value.profileReady),
    firstShowCreated: Boolean(value.firstShowCreated),
    firstEpisodeCreated: Boolean(value.firstEpisodeCreated),
    firstMediaAttached: Boolean(value.firstMediaAttached),
    firstPublish: Boolean(value.firstPublish),
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const show = await prisma.podcastShow.findUnique({
    where: { id },
    select: { id: true, ownerId: true },
  });
  if (!show) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (show.ownerId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [studio, episodes] = await Promise.all([
    prisma.studio.findUnique({ where: { userId: session.user.id }, select: { socialLinks: true, bio: true, bannerUrl: true } }),
    prisma.podcastEpisode.findMany({
      where: { showId: id },
      select: { id: true, status: true, audioUrl: true, muxUploadId: true, muxPlaybackId: true },
      take: 50,
    }),
  ]);

  const root = studio?.socialLinks && typeof studio.socialLinks === "object" && !Array.isArray(studio.socialLinks)
    ? (studio.socialLinks as Record<string, unknown>)
    : {};

  const persisted = mergeOnboarding(root.podcastOnboarding);
  const inferred = {
    profileReady: Boolean(studio?.bio || studio?.bannerUrl),
    firstShowCreated: true,
    firstEpisodeCreated: episodes.length > 0,
    firstMediaAttached: episodes.some((episode) => Boolean(episode.audioUrl || episode.muxUploadId || episode.muxPlaybackId)),
    firstPublish: episodes.some((episode) => episode.status === "PUBLISHED"),
  };

  const steps = {
    profileReady: persisted.profileReady || inferred.profileReady,
    firstShowCreated: persisted.firstShowCreated || inferred.firstShowCreated,
    firstEpisodeCreated: persisted.firstEpisodeCreated || inferred.firstEpisodeCreated,
    firstMediaAttached: persisted.firstMediaAttached || inferred.firstMediaAttached,
    firstPublish: persisted.firstPublish || inferred.firstPublish,
  };

  const completed = Object.values(steps).filter(Boolean).length;
  const total = Object.keys(steps).length;

  return NextResponse.json({
    steps,
    progress: {
      completed,
      total,
      percent: Math.round((completed / total) * 100),
    },
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const show = await prisma.podcastShow.findUnique({ where: { id }, select: { ownerId: true } });
  if (!show) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (show.ownerId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const studio = await prisma.studio.findUnique({ where: { userId: session.user.id }, select: { socialLinks: true, username: true } });
  const current = studio?.socialLinks && typeof studio.socialLinks === "object" && !Array.isArray(studio.socialLinks)
    ? (studio.socialLinks as Record<string, unknown>)
    : {};

  const socialLinks = {
    ...current,
    podcastOnboarding: parsed.data.steps,
  };

  if (studio) {
    await prisma.studio.update({ where: { userId: session.user.id }, data: { socialLinks } });
  } else {
    await prisma.studio.create({
      data: {
        userId: session.user.id,
        username: `creator-${session.user.id.slice(0, 8)}`,
        socialLinks,
      },
    });
  }

  return NextResponse.json({ ok: true, steps: parsed.data.steps });
}
