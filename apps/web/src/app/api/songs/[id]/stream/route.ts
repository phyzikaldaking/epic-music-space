import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await prisma.song.updateMany({
    where: { id, isActive: true },
    data: { streamCount: { increment: 1 } },
  });

  return NextResponse.json({ ok: true });
}
