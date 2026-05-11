import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCronRequest } from "@/lib/routeAuth";
import { draftCommunityComment } from "@/lib/marketingEngine";

export const runtime = "nodejs";
export const maxDuration = 60;

// Daily: drafts COMMUNITY_COMMENT MarketingPost rows for a small
// fraction of recent tracks. The drafts NEVER auto-post — an admin
// must approve them in /admin/ai. This keeps the platform from
// astroturfing while still giving the team a one-tap "say something
// nice on this new release" workflow.
//
// Gate: respects COMMUNITY_AI_ENABLED=1. When off, the cron is a
// no-op so we don't even spend OpenAI tokens.

export async function GET(req: NextRequest) {
  const cronGate = requireCronRequest(req);
  if (!cronGate.ok) return cronGate.response;
  if (process.env.COMMUNITY_AI_ENABLED !== "1") {
    return NextResponse.json({ ok: true, disabled: true });
  }

  // Pick songs from the last 72 hours that don't already have a
  // pending COMMUNITY_COMMENT draft.
  const since = new Date(Date.now() - 72 * 60 * 60 * 1000);
  const recent = await prisma.song.findMany({
    where: {
      isActive: true,
      isDraft: false,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: {
      id: true,
      title: true,
      genre: true,
      artistId: true,
      artist_: { select: { name: true, username: true } },
    },
  });

  if (recent.length === 0) {
    return NextResponse.json({ ok: true, drafted: 0 });
  }

  // Existing drafts for any of these song ids. Prisma's JSON filter
  // doesn't support `in` on a path, so we OR a list of equals checks.
  const existingDrafts = await prisma.marketingPost.findMany({
    where: {
      kind: "COMMUNITY_COMMENT",
      status: { in: ["DRAFT", "SCHEDULED", "PUBLISHED"] },
      OR: recent.map((r) => ({
        targetRef: { path: ["id"], equals: r.id },
      })),
    },
    select: { targetRef: true },
  });
  const alreadyHandled = new Set(
    existingDrafts
      .map((d) => (d.targetRef as { id?: string } | null)?.id)
      .filter((x): x is string => typeof x === "string"),
  );

  // Sample roughly 1 in 5 tracks so the bot doesn't comment on
  // everything (which would feel astroturfed). The selection is
  // deterministic per-track via hash so re-running the cron picks
  // the same set.
  const PICK_FRACTION = 0.2;
  const chosen = recent.filter((s) => {
    if (alreadyHandled.has(s.id)) return false;
    return djb2(s.id) % 100 < PICK_FRACTION * 100;
  });

  let drafted = 0;
  for (const song of chosen) {
    const text = await draftCommunityComment({
      id: song.id,
      title: song.title,
      genre: song.genre,
      artistName: song.artist_.name ?? song.artist_.username ?? "the artist",
    });
    if (!text) continue;
    await prisma.marketingPost.create({
      data: {
        kind: "COMMUNITY_COMMENT",
        status: "DRAFT",
        targetRef: { kind: "song", id: song.id, name: song.title, href: `/track/${song.id}` },
        payload: { commentBody: text, targetUrl: `/track/${song.id}` },
      },
    });
    drafted++;
  }

  return NextResponse.json({
    ok: true,
    candidates: recent.length,
    chosen: chosen.length,
    drafted,
  });
}

function djb2(s: string): number {
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
