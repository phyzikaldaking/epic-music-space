import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_PODCAST_TEMPLATES,
  PODCAST_CADENCES,
  PODCAST_FORMATS,
  parseStoredTemplates,
  type PodcastTemplate,
} from "@/lib/podcast";

export const runtime = "nodejs";

const saveSchema = z.object({
  templates: z.array(
    z.object({
      id: z.string().min(2).max(80),
      name: z.string().min(2).max(80),
      format: z.enum(PODCAST_FORMATS),
      cadence: z.enum(PODCAST_CADENCES),
      clipTarget: z.number().int().min(0).max(30),
      defaultChecklist: z.array(z.string().min(1).max(120)).max(16),
    }),
  ),
});

function readTemplatePayload(socialLinks: unknown): PodcastTemplate[] {
  if (!socialLinks || typeof socialLinks !== "object" || Array.isArray(socialLinks)) return [...DEFAULT_PODCAST_TEMPLATES];
  const root = socialLinks as Record<string, unknown>;
  const fromStore = parseStoredTemplates(root.podcastTemplates);
  if (fromStore.length === 0) return [...DEFAULT_PODCAST_TEMPLATES];
  return fromStore;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const show = await prisma.podcastShow.findUnique({ where: { id }, select: { ownerId: true } });
  if (!show) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (show.ownerId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const studio = await prisma.studio.findUnique({ where: { userId: session.user.id }, select: { socialLinks: true } });
  return NextResponse.json({ templates: readTemplatePayload(studio?.socialLinks) });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const show = await prisma.podcastShow.findUnique({ where: { id }, select: { ownerId: true } });
  if (!show) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (show.ownerId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = saveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  const current = await prisma.studio.findUnique({ where: { userId: session.user.id }, select: { socialLinks: true } });
  const existing = current?.socialLinks && typeof current.socialLinks === "object" && !Array.isArray(current.socialLinks)
    ? (current.socialLinks as Record<string, unknown>)
    : {};

  const socialLinks = {
    ...existing,
    podcastTemplates: parsed.data.templates,
  };

  await prisma.studio.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      username: `creator-${session.user.id.slice(0, 8)}`,
      socialLinks,
    },
    update: {
      socialLinks,
    },
  });

  return NextResponse.json({ ok: true, templates: parsed.data.templates });
}
