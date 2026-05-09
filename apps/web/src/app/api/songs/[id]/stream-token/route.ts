import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { lenientLimiter } from "@/lib/rateLimit";
import { issueStreamToken } from "@/lib/streamToken";
import { getRedis } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STREAM_TOKEN_TTL_SECONDS = Math.max(
  60,
  Number(process.env.STREAM_TOKEN_TTL_SECONDS ?? "300"),
);
const STREAM_GUARD_KEY = "ems:stream:guard:global";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  try {
    await lenientLimiter.consume(`stream-token:${ip}`);
  } catch {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const session = await auth();
  const viewerId = session?.user?.id ?? null;

  const redis = getRedis();
  if (redis) {
    try {
      const guardRaw = await redis.get(STREAM_GUARD_KEY);
      if (guardRaw) {
        const guard = JSON.parse(guardRaw) as { mode?: "blocked" | "preview_only"; reason?: string | null };
        if (guard.mode === "blocked") {
          return NextResponse.json(
            { error: "stream_guard_blocked", message: guard.reason ?? "Streaming is temporarily disabled." },
            { status: 503 },
          );
        }
      }
    } catch {
      // Degrade gracefully if guard lookup fails.
    }
  }

  let allowFull = false;
  try {
    const song = await prisma.song.findUnique({
      where: { id },
      select: {
        id: true,
        isActive: true,
        isDraft: true,
        artistId: true,
        allowFreeDownload: true,
      },
    });

    if (!song?.isActive) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const isOwner = viewerId != null && viewerId === song.artistId;
    if (song.isDraft && !isOwner) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (isOwner || song.allowFreeDownload) {
      allowFull = true;
    } else if (viewerId) {
      const activeLicense = await prisma.licenseToken.findFirst({
        where: {
          songId: song.id,
          holderId: viewerId,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      allowFull = !!activeLicense;
    }
  } catch {
    return NextResponse.json({ error: "Unable to issue stream token" }, { status: 503 });
  }

  const token = issueStreamToken({
    songId: id,
    userId: viewerId,
    ip,
    userAgent: req.headers.get("user-agent"),
    allowFull,
    ttlSeconds: STREAM_TOKEN_TTL_SECONDS,
  });

  return NextResponse.json({
    token,
    streamUrl: `/api/songs/${id}/stream?st=${encodeURIComponent(token)}`,
    allowFull,
    expiresIn: STREAM_TOKEN_TTL_SECONDS,
  });
}
