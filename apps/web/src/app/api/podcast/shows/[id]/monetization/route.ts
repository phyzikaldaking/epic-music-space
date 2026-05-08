import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const monetizationSchema = z.object({
  sponsorSlots: z.number().int().min(0).max(10),
  cpmUsd: z.number().min(0).max(2000),
  merchConversionPct: z.number().min(0).max(100),
  avgMerchOrderUsd: z.number().min(0).max(10000),
  premiumUpsellPct: z.number().min(0).max(100),
  premiumPriceUsd: z.number().min(0).max(1000),
});

const DEFAULT_INPUTS = {
  sponsorSlots: 2,
  cpmUsd: 28,
  merchConversionPct: 1.5,
  avgMerchOrderUsd: 34,
  premiumUpsellPct: 0.9,
  premiumPriceUsd: 7,
};

function estimateRevenue(totalViews: number, episodeCount: number, inputs: typeof DEFAULT_INPUTS) {
  const sponsor = (totalViews / 1000) * inputs.cpmUsd * Math.max(1, inputs.sponsorSlots);
  const merch = totalViews * (inputs.merchConversionPct / 100) * inputs.avgMerchOrderUsd;
  const premium = totalViews * (inputs.premiumUpsellPct / 100) * inputs.premiumPriceUsd;
  const monthly = sponsor + merch + premium;

  return {
    sponsor: Number(sponsor.toFixed(2)),
    merch: Number(merch.toFixed(2)),
    premium: Number(premium.toFixed(2)),
    monthly: Number(monthly.toFixed(2)),
    perEpisode: episodeCount > 0 ? Number((monthly / episodeCount).toFixed(2)) : 0,
  };
}

function normalizeInputs(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ...DEFAULT_INPUTS };
  const source = input as Partial<typeof DEFAULT_INPUTS>;
  return {
    sponsorSlots: Number(source.sponsorSlots ?? DEFAULT_INPUTS.sponsorSlots),
    cpmUsd: Number(source.cpmUsd ?? DEFAULT_INPUTS.cpmUsd),
    merchConversionPct: Number(source.merchConversionPct ?? DEFAULT_INPUTS.merchConversionPct),
    avgMerchOrderUsd: Number(source.avgMerchOrderUsd ?? DEFAULT_INPUTS.avgMerchOrderUsd),
    premiumUpsellPct: Number(source.premiumUpsellPct ?? DEFAULT_INPUTS.premiumUpsellPct),
    premiumPriceUsd: Number(source.premiumPriceUsd ?? DEFAULT_INPUTS.premiumPriceUsd),
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const show = await prisma.podcastShow.findUnique({
    where: { id },
    select: {
      ownerId: true,
      totalViews: true,
      episodes: { select: { id: true } },
    },
  });
  if (!show) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (show.ownerId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const studio = await prisma.studio.findUnique({ where: { userId: session.user.id }, select: { socialLinks: true } });
  const root = studio?.socialLinks && typeof studio.socialLinks === "object" && !Array.isArray(studio.socialLinks)
    ? (studio.socialLinks as Record<string, unknown>)
    : {};

  const inputs = normalizeInputs(root.podcastMonetization);
  const revenue = estimateRevenue(show.totalViews, show.episodes.length, inputs);

  return NextResponse.json({
    inputs,
    revenue,
    assumptions: [
      "Sponsor revenue uses CPM x total views x sponsor slots.",
      "Merch assumes conversion from total views.",
      "Premium assumes direct upsell from viewers.",
    ],
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const show = await prisma.podcastShow.findUnique({ where: { id }, select: { ownerId: true } });
  if (!show) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (show.ownerId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = monetizationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const studio = await prisma.studio.findUnique({ where: { userId: session.user.id }, select: { socialLinks: true, username: true } });
  const current = studio?.socialLinks && typeof studio.socialLinks === "object" && !Array.isArray(studio.socialLinks)
    ? (studio.socialLinks as Record<string, unknown>)
    : {};

  const socialLinks = {
    ...current,
    podcastMonetization: parsed.data,
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

  return NextResponse.json({ ok: true, inputs: parsed.data });
}
