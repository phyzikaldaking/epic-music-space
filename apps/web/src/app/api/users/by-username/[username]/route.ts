import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lenientLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";

/**
 * GET /api/users/by-username/[username]
 *
 * Returns { user: { id, name, image, isVerified }, songs: [...] } for the
 * matching studio username. Auth-gated + rate-limited because this endpoint
 * surfaces a user's ID + active catalog (used by the Verzuz creator) and
 * we don't want it scrapable.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await lenientLimiter.consume(`user-by-username:${ip}`);
  } catch {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const { username } = await params;
  const cleanUsername = username.trim().replace(/^@/, "");
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(cleanUsername)) {
    return NextResponse.json({ error: "Invalid username." }, { status: 400 });
  }

  const studio = await prisma.studio.findUnique({
    where: { username: cleanUsername },
    select: {
      user: {
        select: {
          id: true,
          name: true,
          image: true,
          isVerified: true,
          songs: {
            where: { isActive: true },
            orderBy: { createdAt: "desc" },
            take: 50,
            select: { id: true, title: true, coverUrl: true, genre: true },
          },
        },
      },
    },
  });
  if (!studio) {
    return NextResponse.json({ error: "Artist not found." }, { status: 404 });
  }

  return NextResponse.json({
    user: {
      id: studio.user.id,
      name: studio.user.name,
      image: studio.user.image,
      isVerified: studio.user.isVerified,
    },
    songs: studio.user.songs,
  });
}
