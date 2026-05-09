import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimitInline";
import { z } from "zod";

const upsertSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, - and _"),
  bio: z.string().max(500).optional(),
  bannerUrl: z.string().url().optional(),
  district: z.enum(["INDIE_BLOCKS", "DOWNTOWN_PRIME", "LABEL_ROW"]).optional(),
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

  const blocked = await rateLimit("moderate", `studio:upsert:${session.user.id}`);
  if (blocked) return blocked;

  const body = await req.json();
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const { username, bio, bannerUrl, district, socialLinks } = parsed.data;

  // Check username uniqueness (excluding current user)
  const existing = await prisma.studio.findFirst({
    where: { username, userId: { not: session.user.id } },
  });
  if (existing) {
    return NextResponse.json({ error: "Username is already taken." }, { status: 409 });
  }

  const studio = await prisma.studio.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, username, bio, bannerUrl, socialLinks, ...(district && { district }) },
    update: { username, bio, bannerUrl, socialLinks, ...(district && { district }) },
  });

  // Promote to ARTIST when a LISTENER first saves a studio — saving a
  // studio = "I'm a creator." Without this, a LISTENER who just finished
  // setup is still routed back to setup by /vault/new on their next
  // upload attempt (the role check). PRODUCER / ENGINEER / LABEL / ADMIN
  // / ARTIST roles are left untouched — they all already grant upload
  // intent and we don't want to overwrite a more-specific role.
  //
  // Also grant a 14-day PRO trial on first promotion so a brand-new
  // artist gets analytics, boost, and the full song quota out of the
  // gate. We only set trialExpiresAt when there isn't one already, so
  // a returning artist whose trial expired doesn't get a free renewal
  // by clicking through setup a second time. Trial flips them to TRIAL
  // tier, which expires back to FREE via getActiveTier on its own.
  const TRIAL_DAYS = 14;
  const trialExpiresAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.user.updateMany({
    where: {
      id: session.user.id,
      role: "LISTENER",
      trialExpiresAt: null,
      subscriptionTier: "FREE",
    },
    data: {
      role: "ARTIST",
      subscriptionTier: "TRIAL",
      trialExpiresAt,
    },
  });
  // Fallback: if the row didn't match the trial preconditions (e.g. a
  // returning user whose trial already expired), still flip the role
  // so they can publish.
  await prisma.user.updateMany({
    where: { id: session.user.id, role: "LISTENER" },
    data: { role: "ARTIST" },
  });

  return NextResponse.json(studio);
}
