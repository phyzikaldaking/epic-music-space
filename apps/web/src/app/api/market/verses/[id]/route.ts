import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const updateSchema = z.object({
  title: z.string().min(3).max(120).optional(),
  description: z.string().max(2000).optional(),
  priceUsd: z.number().min(5).max(50_000).optional(),
  sessionMinutes: z.number().int().min(15).max(360).optional(),
  deliveryDays: z.number().int().min(1).max(30).optional(),
  tags: z.array(z.string().max(30)).max(8).optional(),
  status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]).optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const listing = await prisma.verseListing.findUnique({
    where: { id },
    include: {
      seller: {
        select: { id: true, name: true, username: true, image: true, subscriptionTier: true },
      },
    },
  });
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ listing });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const listing = await prisma.verseListing.findUnique({
    where: { id },
    select: { sellerId: true },
  });
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (listing.sellerId !== session.user.id) {
    return NextResponse.json({ error: "Not yours" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as unknown;
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const updated = await prisma.verseListing.update({
    where: { id },
    data: parsed.data,
  });
  return NextResponse.json({ listing: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const listing = await prisma.verseListing.findUnique({
    where: { id },
    select: { sellerId: true, bookings: { where: { status: { in: ["CONFIRMED", "IN_PROGRESS"] } }, select: { id: true } } },
  });
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (listing.sellerId !== session.user.id) {
    return NextResponse.json({ error: "Not yours" }, { status: 403 });
  }
  // If there are active bookings, soft-archive rather than delete —
  // the bookings need the listing row to render their detail pages.
  if (listing.bookings.length > 0) {
    await prisma.verseListing.update({
      where: { id },
      data: { status: "ARCHIVED" },
    });
    return NextResponse.json({ archived: true });
  }
  await prisma.verseListing.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
