import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { lenientLimiter } from "@/lib/rateLimit";

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  image: z.string().url("image must be a valid URL").optional(),
});

/**
 * GET /api/user/profile
 *
 * Returns the authenticated user's public profile:
 *   id, name, email, image, role, username, createdAt,
 *   plus follower/following counts and owned-song count.
 *
 * Auth: required.
 */
export async function GET(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  try {
    await lenientLimiter.consume(ip);
  } catch {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      username: true,
      createdAt: true,
      studio: { select: { username: true, bio: true, district: true } },
      _count: {
        select: {
          songs: true,
          followers: true,
          following: true,
          licenses: true,
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(user);
}

/**
 * PATCH /api/user/profile
 *
 * Updates the authenticated user's mutable profile fields (name, image).
 *
 * Body (JSON):
 *   name?   — display name (max 100 chars)
 *   image?  — avatar URL
 *
 * Returns the updated user record.
 *
 * Auth: required.
 */
export async function PATCH(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  try {
    await lenientLimiter.consume(ip);
  } catch {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: parsed.data,
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      username: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(updated);
}
