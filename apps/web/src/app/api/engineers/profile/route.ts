import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimitInline";

export const runtime = "nodejs";

// Engineer Mode profile CRUD. One profile per user. Verification is
// admin-only — the verifiedAt flag is what unlocks ENGINEER_MIX /
// ENGINEER_MASTER VerseListings on the create endpoint. Anyone can
// create the row; only an admin can stamp verifiedAt.

const upsertSchema = z.object({
  tagline: z.string().max(160).optional().nullable(),
  bio: z.string().max(4000).optional().nullable(),
  specialties: z.array(z.string().max(40)).max(12).optional(),
  gearChain: z.string().max(2000).optional().nullable(),
  maxSampleRate: z.number().int().min(44100).max(192000).optional(),
  lufsTargets: z.array(z.number().min(-30).max(-6)).max(6).optional(),
  turnaroundHours: z.number().int().min(1).max(720).optional(),
  sampleWorkUrls: z.array(z.string().url().max(2000)).max(6).optional(),
  isAcceptingWork: z.boolean().optional(),
});

// GET /api/engineers/profile — read the authenticated user's row.
// Returns null if no row exists (so /engineers/list can render its
// blank form).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const profile = await prisma.engineerProfile.findUnique({
    where: { userId: session.user.id },
  });
  return NextResponse.json({ profile });
}

// POST /api/engineers/profile — create or update the row. Idempotent.
// New rows land unverified; admin stamps `verifiedAt` separately.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const blocked = await rateLimit("moderate", `engineer:profile:${session.user.id}`);
  if (blocked) return blocked;

  const body = (await req.json().catch(() => ({}))) as unknown;
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const profile = await prisma.engineerProfile.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      tagline: data.tagline ?? null,
      bio: data.bio ?? null,
      specialties: data.specialties ?? [],
      gearChain: data.gearChain ?? null,
      maxSampleRate: data.maxSampleRate ?? 48000,
      lufsTargets: data.lufsTargets ?? [],
      turnaroundHours: data.turnaroundHours ?? 48,
      sampleWorkUrls: data.sampleWorkUrls ?? [],
      isAcceptingWork: data.isAcceptingWork ?? true,
    },
    update: {
      tagline: data.tagline ?? null,
      bio: data.bio ?? null,
      ...(data.specialties !== undefined ? { specialties: data.specialties } : {}),
      gearChain: data.gearChain ?? null,
      ...(data.maxSampleRate !== undefined ? { maxSampleRate: data.maxSampleRate } : {}),
      ...(data.lufsTargets !== undefined ? { lufsTargets: data.lufsTargets } : {}),
      ...(data.turnaroundHours !== undefined ? { turnaroundHours: data.turnaroundHours } : {}),
      ...(data.sampleWorkUrls !== undefined ? { sampleWorkUrls: data.sampleWorkUrls } : {}),
      ...(data.isAcceptingWork !== undefined ? { isAcceptingWork: data.isAcceptingWork } : {}),
    },
  });

  return NextResponse.json({ profile });
}
