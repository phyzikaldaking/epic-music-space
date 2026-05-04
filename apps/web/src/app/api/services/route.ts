import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimitInline";
import { canListServices, kindsAllowedForRole } from "@/lib/serviceListings";

export const runtime = "nodejs";

const KIND_VALUES = [
  "MIX", "MASTER", "MIX_MASTER_BUNDLE",
  "PRODUCER_TEMPLATE", "BEAT", "DRUM_KIT", "SAMPLE_PACK",
  "LESSON",
] as const;

const createSchema = z.object({
  kind: z.enum(KIND_VALUES),
  title: z.string().min(3).max(120),
  description: z.string().min(20).max(4000),
  priceUsd: z.number().min(1).max(10_000),
  deliveryDays: z.number().int().min(1).max(60).default(7),
  exampleAudioUrl: z.string().url().optional(),
  downloadUrl: z.string().url().optional(),
  coverUrl: z.string().url().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await rateLimit("strict", `services:create:${session.user.id}`);
  if (blocked) return blocked;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (!user || !canListServices(user.role)) {
    return NextResponse.json({ error: "Producer or Engineer accounts only." }, { status: 403 });
  }
  if (!kindsAllowedForRole(user.role).includes(parsed.data.kind)) {
    return NextResponse.json({ error: "That listing type isn't allowed for your role." }, { status: 403 });
  }

  const created = await prisma.serviceListing.create({
    data: {
      providerId: session.user.id,
      kind: parsed.data.kind,
      title: parsed.data.title,
      description: parsed.data.description,
      priceUsd: parsed.data.priceUsd,
      deliveryDays: parsed.data.deliveryDays,
      exampleAudioUrl: parsed.data.exampleAudioUrl ?? null,
      downloadUrl: parsed.data.downloadUrl ?? null,
      coverUrl: parsed.data.coverUrl ?? null,
    },
    select: { id: true },
  });

  return NextResponse.json({ id: created.id }, { status: 201 });
}

export async function GET() {
  const listings = await prisma.serviceListing.findMany({
    where: { status: "LIVE" },
    orderBy: [{ totalSold: "desc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      provider: { select: { id: true, name: true, image: true, username: true, role: true } },
    },
  });
  return NextResponse.json({ listings });
}
