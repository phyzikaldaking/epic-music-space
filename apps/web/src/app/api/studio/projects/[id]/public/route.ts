import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRequestId, jsonWithRequestId } from "@/lib/requestTracing";
import { lenientLimiter, getClientIp } from "@/lib/rateLimit";

// Read-only public-share endpoint (#9). Returns the project only when
// owner has flipped isPublic = true; otherwise 404 — never 403, so we
// don't even confirm the project exists to unauthorized requesters.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(req);

  // Per-IP rate limit (#8). The endpoint is unauthenticated and project
  // ids are guessable cuids, so without this an attacker could enumerate
  // every public project and scrape blob URLs for redistribution. 100
  // reqs/min/IP is generous for legitimate fans hitting refresh and
  // tight enough to make brute enumeration expensive. We allow the
  // request through on limiter failure so a Redis blip doesn't black
  // out shared listen pages — fail-open is the right default for read
  // traffic.
  try {
    await lenientLimiter.consume(`studio:listen:${getClientIp(req)}`);
  } catch (err) {
    if (err && typeof err === "object" && "msBeforeNext" in err) {
      return jsonWithRequestId(
        requestId,
        { error: "Too many requests. Try again shortly." },
        {
          status: 429,
          headers: {
            "Retry-After": Math.ceil(
              Number((err as { msBeforeNext: number }).msBeforeNext) / 1000,
            ).toString(),
          },
        },
      );
    }
    // Limiter unavailable (Redis down, etc.) — fail open for reads.
  }

  const { id } = await params;

  const project = await prisma.studioProject.findFirst({
    where: { id, isPublic: true },
    select: {
      id: true,
      name: true,
      bpm: true,
      trackCount: true,
      thumbnailPeaks: true,
      coverArtUrl: true,
      masterBlobUrl: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { name: true, image: true } },
      tracks: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          name: true,
          color: true,
          blobUrl: true,
          durationSec: true,
          position: true,
        },
      },
    },
  });

  if (!project) {
    return jsonWithRequestId(requestId, { error: "Not found" }, { status: 404 });
  }
  return jsonWithRequestId(requestId, { project });
}
