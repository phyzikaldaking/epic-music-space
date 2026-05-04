import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { paused?: boolean };
  const targetActive = body.paused === true ? false : true;

  const placement = await prisma.adPlacement.findUnique({
    where: { id },
    select: { ownerId: true },
  });
  if (!placement) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (placement.ownerId !== session.user.id) {
    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });
    if (me?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const updated = await prisma.adPlacement.update({
    where: { id },
    data: { isActive: targetActive },
    select: { id: true, isActive: true },
  });

  return NextResponse.json({ ok: true, isActive: updated.isActive });
}
