import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hashIp, clientIp } from "@/lib/adTracking";
import { rateLimit } from "@/lib/rateLimitInline";

export const runtime = "nodejs";

const DEDUPE_WINDOW_MS = 5 * 60 * 1000; // collapse repeats within 5 min

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Origin / Referer gate — only accept impression beacons from our own
  // origins (or trusted preview deployments). Trivial CSRF + scraped-bot
  // discouragement; the real fraud signal is the dedupe window below.
  const origin = req.headers.get("origin") ?? "";
  const referer = req.headers.get("referer") ?? "";
  const allowed = (process.env.NEXT_PUBLIC_SITE_URL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length > 0) {
    const sourceUrl = origin || referer;
    const ok = sourceUrl && allowed.some((a) => sourceUrl.startsWith(a));
    if (!ok && !sourceUrl.includes(".vercel.app")) {
      return NextResponse.json({ ok: false, reason: "origin" }, { status: 403 });
    }
  }

  const ip = clientIp(req);
  const ipHash = hashIp(ip);

  // Lenient: 100 / min / IP — impressions are noisy
  const blocked = await rateLimit("lenient", `ad:impression:${ipHash}`);
  if (blocked) return blocked;

  // Verify placement is currently live
  const placement = await prisma.adPlacement.findUnique({
    where: { id },
    select: { isActive: true, startDate: true, endDate: true },
  });
  if (!placement) return NextResponse.json({ ok: false }, { status: 404 });
  const now = new Date();
  if (!placement.isActive || placement.startDate > now || placement.endDate < now) {
    return NextResponse.json({ ok: false, reason: "not_live" });
  }

  const body = (await req.json().catch(() => ({}))) as {
    sessionId?: string;
  };

  // Dedupe within window: same IP+placement seen recently → no-op so we don't
  // inflate counts on simple page-rerenders.
  const recent = await prisma.adImpression.findFirst({
    where: {
      placementId: id,
      ipHash,
      createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
    },
    select: { id: true },
  });
  if (recent) return NextResponse.json({ ok: true, deduped: true });

  const session = await auth();
  const userAgent = req.headers.get("user-agent")?.slice(0, 1000) ?? null;
  const referrer = req.headers.get("referer")?.slice(0, 500) ?? null;

  await prisma.adImpression.create({
    data: {
      placementId: id,
      userId: session?.user?.id ?? null,
      sessionId: body.sessionId?.slice(0, 64) ?? null,
      ipHash,
      userAgent,
      referrer,
    },
  });

  return NextResponse.json({ ok: true });
}
