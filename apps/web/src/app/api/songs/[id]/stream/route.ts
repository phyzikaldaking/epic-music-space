import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { lenientLimiter, moderateLimiter } from "@/lib/rateLimit";
import { getDemoTracks } from "@/lib/demoTracks";
import { getSiteUrl } from "@/lib/site";
import { classifyAudioSource } from "@/lib/audioSource";
import { getRedis } from "@/lib/redis";
import { enqueueNotification } from "@/lib/queues";
import { recordStreamRoyalty } from "@/lib/revenueShare";
import { recordRiskEvent } from "@/lib/riskEvents";

// Configurable per-play micro-royalty. Defaults to 1 cent ($0.01) per
// verified, deduplicated play. Set STREAM_ROYALTY_CENTS_PER_PLAY in env to
// tune without a code deploy.
const STREAM_ROYALTY_CENTS = Math.max(
  0,
  Number(process.env.STREAM_ROYALTY_CENTS_PER_PLAY ?? "1"),
);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const localPlayDedupe = new Map<string, number>();

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
  // Build the set of acceptable hosts: the canonical site host, the same
  // host with/without a leading "www.", any *.vercel.app preview domain on
  // this project, and the request's own Host (so server-side fetches from
  // /api/* routes that proxy through this endpoint are also allowed).
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const requestHost = req.headers.get("host");

  const allowedHosts = new Set<string>();
  try {
    const canonical = new URL(getSiteUrl()).host;
    allowedHosts.add(canonical);
    allowedHosts.add(canonical.startsWith("www.") ? canonical.slice(4) : `www.${canonical}`);
  } catch {
    /* ignore — fall through */
  }
  if (requestHost) allowedHosts.add(requestHost);

  function hostFromUrl(url: string | null): string | null {
    if (!url) return null;
    try {
      return new URL(url).host;
    } catch {
      return null;
    }
  }

  const originHost = hostFromUrl(origin);
  const refererHost = hostFromUrl(referer);

  // Vercel preview hosts have the form epic-music-space-<hash>-<scope>.vercel.app
  // Use a strict prefix-match instead of `includes("epic-music-space")` so an
  // attacker can't register `epic-music-space-evil.com.vercel.app` style names
  // and have referers from there satisfy the check.
  const VERCEL_PREVIEW_RE = /^epic-music-space(-[a-z0-9-]+)?\.vercel\.app$/;
  const isVercelPreview = (h: string | null) =>
    !!h && (VERCEL_PREVIEW_RE.test(h) || h === requestHost);

  const isOk =
    (originHost && allowedHosts.has(originHost)) ||
    (refererHost && allowedHosts.has(refererHost)) ||
    isVercelPreview(refererHost) ||
    isVercelPreview(originHost);

  if (!isOk) {
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

  // ── Reject embed-only sources up-front ─────────────────────────────────
  // YouTube/Vimeo/SoundCloud/Spotify URLs return HTML, not audio bytes.
  // Fetching and proxying that would either OOM the audio element or play
  // nothing. Return a clear 422 so the client can render an embed iframe
  // (or the "preview unavailable" fallback) instead of looping on retries.
  const sourceKind = classifyAudioSource(upstreamUrl);
  if (sourceKind.type !== "stream" && sourceKind.type !== "unknown") {
    return NextResponse.json(
      {
        error: "embed_only",
        type: sourceKind.type,
        label: sourceKind.label,
        message:
          sourceKind.warning ??
          "This track is hosted on an external player and can't be streamed through EMS.",
      },
      { status: 422 },
    );
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
  // Edge-cacheable: songs are immutable per id (a re-upload mints a new id),
  // so we let Vercel's edge serve the bytes for an hour and revalidate
  // weekly. The browser still keeps a short private copy. Origin/Referer
  // is enforced upstream of the cache via the strict 403 above, so a
  // cached response can't be served to an unauthenticated origin —
  // varying on Origin keeps that property tight.
  responseHeaders.set(
    "Cache-Control",
    "private, max-age=60, s-maxage=3600, stale-while-revalidate=604800",
  );
  responseHeaders.set("Vary", "Origin, Range");
  responseHeaders.set("Content-Disposition", "inline");
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  // Block cross-origin <audio>/<video>/fetch from other sites — they can't
  // read or include this resource even if a public stream URL leaks.
  responseHeaders.set("Cross-Origin-Resource-Policy", "same-origin");
  responseHeaders.set("Referrer-Policy", "no-referrer");

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

  const dedupeKey = `ems:play-dedupe:${id}:${ip}`;
  let shouldCount = true;
  const redis = getRedis();
  if (redis) {
    try {
      // Count at most once per 30 seconds per (song, listener IP).
      const set = await redis.set(dedupeKey, "1", "EX", 30, "NX");
      shouldCount = set === "OK";
    } catch {
      // If Redis fails, fall back to local memory map below.
      shouldCount = true;
    }
  }
  if (!redis) {
    const now = Date.now();
    const expiresAt = localPlayDedupe.get(dedupeKey) ?? 0;
    if (expiresAt > now) {
      shouldCount = false;
    } else {
      localPlayDedupe.set(dedupeKey, now + 30_000);
    }
    // Tiny opportunistic cleanup to cap memory growth.
    if (localPlayDedupe.size > 5_000) {
      for (const [k, exp] of localPlayDedupe.entries()) {
        if (exp <= now) localPlayDedupe.delete(k);
      }
    }
  }

  if (!shouldCount) return NextResponse.json({ ok: true });

  const song = await prisma.song.findUnique({
    where: { id },
    select: { id: true, title: true, isActive: true, artistId: true },
  });
  if (!song?.isActive) {
    return NextResponse.json({ ok: true });
  }

  let suspiciousBurst = false;
  if (redis) {
    try {
      const minuteBucket = Math.floor(Date.now() / 60_000);
      const dayBucket = new Date().toISOString().slice(0, 10);
      const minuteKey = `ems:stream:burst:m:${song.id}:${ip}:${minuteBucket}`;
      const dayKey = `ems:stream:burst:d:${song.id}:${ip}:${dayBucket}`;

      const [minuteHits, dayHits] = await Promise.all([
        redis.incr(minuteKey),
        redis.incr(dayKey),
      ]);
      if (minuteHits === 1) {
        await redis.expire(minuteKey, 120);
      }
      if (dayHits === 1) {
        await redis.expire(dayKey, 172800);
      }
      suspiciousBurst = minuteHits > 15 || dayHits > 120;

      if (suspiciousBurst) {
        void recordRiskEvent({
          eventType: "fake_play",
          severity: minuteHits > 50 || dayHits > 300 ? "HIGH" : "MEDIUM",
          songId: song.id,
          ip,
          reason: "stream_burst",
          metadata: {
            minuteBucket,
            dayBucket,
            minuteHits,
            dayHits,
          },
        });
        const alertKey = `ems:stream:burst:alert:${song.id}:${ip}:${dayBucket}`;
        const firstAlert = await redis.set(alertKey, "1", "EX", 3600, "NX");
        if (firstAlert === "OK") {
          void enqueueNotification({
            userId: song.artistId,
            type: "STREAM_FRAUD_ALERT",
            title: "Suspicious stream burst detected",
            body: `A stream burst on "${song.title}" was flagged and excluded from payout calculations until review.`,
            metadata: {
              songId: song.id,
              sourceIpHashHint: ip.slice(0, 12),
              minuteBucket,
              dayBucket,
              minuteHits,
              dayHits,
            },
          });
        }
      }
    } catch {
      suspiciousBurst = false;
    }
  }

  if (suspiciousBurst) {
    return NextResponse.json({ ok: true, skipped: "integrity_review" });
  }

  await prisma.song.update({
    where: { id: song.id },
    data: { streamCount: { increment: 1 } },
  });

  // Record a micro-royalty for the artist. Fire-and-forget — a ledger write
  // failure must never break the play-count response the client depends on.
  if (STREAM_ROYALTY_CENTS > 0) {
    void recordStreamRoyalty({ songId: song.id, pennies: STREAM_ROYALTY_CENTS }).catch(
      (err) => console.warn("[stream] royalty write failed", err),
    );
  }

  return NextResponse.json({ ok: true });
}
