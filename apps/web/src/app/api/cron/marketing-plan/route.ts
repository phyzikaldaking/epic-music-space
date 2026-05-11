import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@ems/db";
import { requireCronRequest } from "@/lib/routeAuth";
import { draftWeeklyPlan } from "@/lib/marketingEngine";

export const runtime = "nodejs";
export const maxDuration = 60;

// Weekly: gather platform signals, ask the LLM for a marketing
// plan, persist as MarketingPlan + spawn DRAFT MarketingPost rows
// for each auto-executable action. The /api/cron/marketing-execute
// cron walks DRAFTs and publishes them.

export async function GET(req: NextRequest) {
  const cronGate = requireCronRequest(req);
  if (cronGate) return cronGate;

  // Signal 1: top artists by latest stock snapshot.
  const topSnapshots = await prisma.artistStockSnapshot.findMany({
    distinct: ["artistId"],
    orderBy: [{ artistId: "asc" }, { capturedAt: "desc" }],
    take: 50,
    include: { artist: { select: { id: true, name: true, username: true } } },
  });
  const topArtists = topSnapshots
    .sort((a, b) => Number(b.price) - Number(a.price))
    .slice(0, 6)
    .map((s) => ({
      id: s.artist.id,
      name: s.artist.name ?? s.artist.username ?? "artist",
      price: Number(s.price),
    }));

  // Signal 2: hot songs by recent stream count + AI score.
  const hotSongs = await prisma.song.findMany({
    where: { isActive: true, isDraft: false },
    orderBy: [{ aiScore: "desc" }, { streamCount: "desc" }],
    take: 8,
    select: { id: true, title: true, genre: true },
  });

  // Signal 3: most recent unresolved feedback insights.
  const recentInsights = await prisma.aiInsight.findMany({
    where: { kind: "feedback-theme", resolvedAt: null },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: { title: true, recommendation: true },
  });

  const plan = await draftWeeklyPlan({
    signals: { topArtists, hotSongs, recentInsights },
  });
  if (!plan) {
    return NextResponse.json({ ok: false, reason: "LLM unavailable or refused" });
  }

  // Persist the plan + the DRAFT posts for each auto-exec action.
  const planRow = await prisma.marketingPlan.create({
    data: {
      title: plan.title,
      summary: plan.summary,
      actions: plan.actions as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  // For each `seo` / `social` action that the LLM marked
  // autoExecute=true, spawn placeholder DRAFT MarketingPost rows.
  // The execution cron will fill in actual generated payload.
  let drafted = 0;
  for (const action of plan.actions) {
    if (!action.autoExecute) continue;
    if (action.kind === "seo") {
      await prisma.marketingPost.create({
        data: {
          planId: planRow.id,
          kind: "SEO_PAGE",
          targetRef: {
            kind: action.subjectKind,
            id: action.subjectId,
            href: action.subjectHref,
            name: action.subjectName,
          },
          payload: { status: "pending-generation" },
          scheduledFor: action.scheduledFor ? new Date(action.scheduledFor) : null,
        },
      });
      drafted++;
    }
    if (action.kind === "social") {
      // Three drafts — one per platform.
      for (const platform of ["SOCIAL_TWITTER", "SOCIAL_INSTAGRAM", "SOCIAL_TIKTOK"] as const) {
        await prisma.marketingPost.create({
          data: {
            planId: planRow.id,
            kind: platform,
            targetRef: {
              kind: action.subjectKind,
              id: action.subjectId,
              href: action.subjectHref,
              name: action.subjectName,
            },
            payload: { status: "pending-generation" },
            scheduledFor: action.scheduledFor ? new Date(action.scheduledFor) : null,
          },
        });
        drafted++;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    planId: planRow.id,
    title: plan.title,
    actionsTotal: plan.actions.length,
    draftsCreated: drafted,
  });
}
