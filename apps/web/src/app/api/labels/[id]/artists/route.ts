import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

interface Params {
  params: Promise<{ id: string }>;
}

const offerSchema = z.object({
  artistId: z.string().cuid(),
  revSharePct: z.number().min(1).max(50),
});

const respondSchema = z.object({
  action: z.enum(["accept", "decline"]),
});

/** Label owner: send a signing offer to an artist */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: labelId } = await params;
  const label = await prisma.label.findUnique({ where: { id: labelId } });
  if (!label) {
    return NextResponse.json({ error: "Label not found" }, { status: 404 });
  }
  if (label.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Not label owner" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = offerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const { artistId, revSharePct } = parsed.data;

  const existing = await prisma.labelArtist.findUnique({
    where: { labelId_artistId: { labelId, artistId } },
  });
  if (existing && existing.status === "ACTIVE") {
    return NextResponse.json({ error: "Artist is already signed." }, { status: 409 });
  }

  const entry = await prisma.labelArtist.upsert({
    where: { labelId_artistId: { labelId, artistId } },
    create: { labelId, artistId, revSharePct, status: "PENDING" },
    update: { revSharePct, status: "PENDING" },
  });

  // Create notification for artist
  await prisma.notification.create({
    data: {
      userId: artistId,
      type: "LABEL_OFFER",
      title: `Label offer from ${label.name}`,
      body: `You have been offered a ${revSharePct}% revenue-share deal by ${label.name}. Check your label page to accept or decline.`,
      metadata: { labelId, revSharePct },
    },
  });

  return NextResponse.json(entry, { status: 201 });
}

/** Artist: accept or decline a label offer */
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: labelId } = await params;
  const body = await req.json();
  const parsed = respondSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "action must be 'accept' or 'decline'" }, { status: 400 });
  }

  const entry = await prisma.labelArtist.findUnique({
    where: { labelId_artistId: { labelId, artistId: session.user.id } },
    include: { label: { select: { name: true } } },
  });
  if (!entry) {
    return NextResponse.json({ error: "No offer found" }, { status: 404 });
  }
  if (entry.status !== "PENDING") {
    return NextResponse.json({ error: "Offer is no longer pending" }, { status: 409 });
  }

  const newStatus = parsed.data.action === "accept" ? "ACTIVE" : "TERMINATED";

  await prisma.labelArtist.update({
    where: { id: entry.id },
    data: { status: newStatus },
  });

  return NextResponse.json({ status: newStatus });
}
