import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const patchSchema = z.object({
  status: z.enum(["LIVE", "PAUSED", "ARCHIVED"]).optional(),
  title: z.string().min(3).max(120).optional(),
  description: z.string().min(20).max(4000).optional(),
  priceUsd: z.number().min(1).max(10_000).optional(),
  deliveryDays: z.number().int().min(1).max(60).optional(),
  exampleAudioUrl: z.string().url().optional().nullable(),
  downloadUrl: z.string().url().optional().nullable(),
  coverUrl: z.string().url().optional().nullable(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const listing = await prisma.serviceListing.findUnique({
    where: { id },
    include: { provider: { select: { id: true, name: true, image: true, username: true, role: true } } },
  });
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ listing });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const listing = await prisma.serviceListing.findUnique({
    where: { id },
    select: { providerId: true },
  });
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (listing.providerId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  }

  await prisma.serviceListing.update({
    where: { id },
    data: parsed.data,
  });

  return NextResponse.json({ ok: true });
}
