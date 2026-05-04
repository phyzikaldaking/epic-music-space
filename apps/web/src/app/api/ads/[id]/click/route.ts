import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hashIp, clientIp } from "@/lib/adTracking";
import { rateLimit } from "@/lib/rateLimitInline";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ip = clientIp(req);
  const ipHash = hashIp(ip);

  const blocked = await rateLimit("moderate", `ad:click:${ipHash}`);
  if (blocked) return blocked;

  const placement = await prisma.adPlacement.findUnique({
    where: { id },
    select: { id: true, linkUrl: true, isActive: true, startDate: true, endDate: true },
  });
  if (!placement) return NextResponse.json({ ok: false }, { status: 404 });

  const session = await auth();
  const body = (await req.json().catch(() => ({}))) as { sessionId?: string };

  await prisma.adClick.create({
    data: {
      placementId: id,
      userId: session?.user?.id ?? null,
      sessionId: body.sessionId?.slice(0, 64) ?? null,
      ipHash,
    },
  });

  return NextResponse.json({ ok: true, linkUrl: placement.linkUrl });
}
