import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { lenientLimiter, moderateLimiter } from "@/lib/rateLimit";
import { getDemoTracks } from "@/lib/demoTracks";
import { getSiteUrl } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/songs/[id]/stream
 *
 * Proxies audio bytes from the upstream Supabase URL so the raw URL is never
 * exposed to the browser. Range-aware so seek/scrub work natively in <audio>.
 *
 * Defence layers:
 *  - Loose Origin/Referer check: legit <audio> tags from our pages always send
 *    a Referer; pure curl-with-no-headers is rejected. Determined attackers
 *    can spoof, but every casual download path is closed.
 *  - Per-IP rate limit (lenient, ~100/min) so this can't be used as a
 *    bandwidth amplification proxy.
 *  - No raw upstream URL is ever sent in the response body or headers.
 *  - Content-Disposition: inline so browsers can't auto-download as file.
 *  - Cache-Control: private + short max-age so CDN/proxy caches don't serve
 *    one user's range to another.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return new NextResponse("Missing id", { status: 400 });

  // ── Origin / Referer check ──────────────────────────────────────────────
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const siteHost = new URL(getSiteUrl()).host;
  const isOriginOk =
    !!origin &&
    (origin.endsWith(siteHost) ||
      origin === `https://${siteHost}` ||
      origin === `http://${siteHost}`);
  const isRefererOk =
    !!referer &&
    (() => {
      try {
        return new URL(referer).host === siteHost;
      } catch {
        return false;
      }
    })();

  if (!isOriginOk && !isRefererOk) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // ── Rate limit ──────────────────────────────────────────────────────────
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  try {
    await lenientLimiter.consume(`stream:${ip}`);
  } catch {
    return new NextResponse("Too many requests", { status: 429 });
  }

  // ── Resolve upstream URL (real song first, fall back to demo) ──────────
  let upstreamUrl: string | null = null;
  try {
    const song = await prisma.song.findUnique({
      where: { id },
      select: { audioUrl: true, isActive: true },
    });
    if (song?.isActive) upstreamUrl = song.audioUrl;
  } catch {
    /* DB error — try demo lookup */
  }

  if (!upstreamUrl) {
    try {
      const demos = await getDemoTracks();
      const demo = demos.find((d) => d.id === id);
      if (demo) upstreamUrl = demo.audioUrl;
    } catch {
      /* ignore */
    }
  }

  if (!upstreamUrl) {
    return new NextResponse("Not found", { status: 404 });
  }

  // ── Forward Range header so seek works ──────────────────────────────────
  const upstreamHeaders: Record<string, string> = {};
  const range = req.headers.get("range");
  if (range) upstreamHeaders["Range"] = range;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, { headers: upstreamHeaders });
  } catch {
    return new NextResponse("Upstream unreachable", { status: 502 });
  }

  if (!upstream.ok && upstream.status !== 206) {
    return new NextResponse("Upstream error", { status: upstream.status });
  }

  // ── Pass through to the browser, stripping anything that would leak
  // the upstream URL and adding hardening headers ────────────────────────
  const responseHeaders = new Headers();
  const contentType = upstream.headers.get("content-type") ?? "audio/mpeg";
  responseHeaders.set("Content-Type", contentType);
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) responseHeaders.set("Content-Length", contentLength);
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) responseHeaders.set("Content-Range", contentRange);
  responseHeaders.set("Accept-Ranges", "bytes");
  responseHeaders.set("Cache-Control", "private, max-age=60");
  responseHeaders.set("Content-Disposition", "inline");
  responseHeaders.set("X-Content-Type-Options", "nosniff");

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

/**
 * POST /api/songs/[id]/stream
 *
 * Lightweight analytics counter — kept separate from the proxy GET above so
 * existing play-tracking calls keep working unchanged.
 */
export async function POST(
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
    await moderateLimiter.consume(`stream-track:${ip}`);
  } catch {
    return NextResponse.json({ ok: true });
  }

  await prisma.song.updateMany({
    where: { id, isActive: true },
    data: { streamCount: { increment: 1 } },
  });

  return NextResponse.json({ ok: true });
}
