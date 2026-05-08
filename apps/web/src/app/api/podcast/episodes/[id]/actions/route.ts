import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { derivePodcastBlockers } from "@/lib/podcast";

export const runtime = "nodejs";

const actionSchema = z.object({
  action: z.enum(["retry_ingest", "mark_transcript_ready", "generate_clips", "publish_now", "archive_now"]),
  overrideGuardrails: z.boolean().optional().default(false),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid action" }, { status: 400 });

  const episode = await prisma.podcastEpisode.findUnique({
    where: { id },
    include: { show: { select: { ownerId: true } } },
  });
  if (!episode) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (episode.show.ownerId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (parsed.data.action === "retry_ingest") {
    const updated = await prisma.podcastEpisode.update({
      where: { id },
      data: {
        videoStatus: episode.muxUploadId ? "UPLOADING" : "PROCESSING",
      },
      select: { id: true, videoStatus: true },
    });
    return NextResponse.json({ ok: true, updated });
  }

  if (parsed.data.action === "mark_transcript_ready") {
    const updated = await prisma.podcastEpisode.update({
      where: { id },
      data: {
        transcript: episode.transcript?.trim() || "Transcript ready for review.",
      },
      select: { id: true, transcript: true },
    });
    return NextResponse.json({ ok: true, updated });
  }

  if (parsed.data.action === "generate_clips") {
    const updated = await prisma.podcastEpisode.update({
      where: { id },
      data: {
        clipCount: Math.max(episode.clipCount, 3),
      },
      select: { id: true, clipCount: true },
    });
    return NextResponse.json({ ok: true, updated });
  }

  if (parsed.data.action === "archive_now") {
    const updated = await prisma.podcastEpisode.update({
      where: { id },
      data: { status: "ARCHIVED" },
      select: { id: true, status: true },
    });
    return NextResponse.json({ ok: true, updated });
  }

  const blockers = derivePodcastBlockers(episode);
  if (blockers.length > 0 && !parsed.data.overrideGuardrails) {
    return NextResponse.json(
      {
        error: "Episode failed publish guardrails.",
        blockers,
      },
      { status: 409 },
    );
  }

  const updated = await prisma.podcastEpisode.update({
    where: { id },
    data: {
      status: "PUBLISHED",
      publishedAt: episode.publishedAt ?? new Date(),
    },
    select: { id: true, status: true, publishedAt: true },
  });

  return NextResponse.json({ ok: true, blockers, updated });
}
