import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { lenientLimiter } from "@/lib/rateLimit";

const schema = z.object({
  role: z.enum(["ARTIST", "PRODUCER", "ENGINEER", "LABEL"]),
  username: z.string().trim().min(3).max(32),
  bio: z.string().trim().max(256).optional(),
});

function normalizeUsername(value: string) {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

function isSafeUsername(value: string) {
  return /^[a-z0-9_]+$/.test(value);
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";

  try {
    await lenientLimiter.consume(ip);
  } catch {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid creator profile." }, { status: 400 });

  const username = normalizeUsername(parsed.data.username);
  if (!isSafeUsername(username)) {
    return NextResponse.json({ error: "Use only letters, numbers, and underscores for the studio username." }, { status: 400 });
  }

  const existing = await prisma.studio.findUnique({ where: { username }, select: { userId: true } });
  if (existing && existing.userId !== session.user.id) {
    return NextResponse.json({ error: "That studio username is already taken." }, { status: 409 });
  }

  const bio = parsed.data.bio?.trim() || null;

  const [updatedUser, studio] = await prisma.$transaction([
    prisma.user.update({
      where: { id: session.user.id },
      data: { role: parsed.data.role },
      select: { id: true, role: true },
    }),
    prisma.studio.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, username, bio },
      update: { username, ...(bio !== null ? { bio } : {}) },
      select: { username: true, bio: true },
    }),
  ]);

  return NextResponse.json({ ok: true, user: updatedUser, studio, profileUrl: `/studio/${studio.username}` });
}
