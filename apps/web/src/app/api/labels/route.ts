import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/),
  bio: z.string().max(1000).optional(),
  logoUrl: z.string().url().optional(),
  revSharePct: z.number().min(1).max(50).default(10),
});

export async function GET() {
  const labels = await prisma.label.findMany({
    include: {
      owner: { select: { name: true, image: true } },
      _count: { select: { artists: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(labels);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { ownedLabel: true },
  });

  if (user?.ownedLabel) {
    return NextResponse.json({ error: "You already own a label." }, { status: 409 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const label = await prisma.label.create({
    data: { ...parsed.data, ownerId: session.user.id },
  });

  // Promote user role to LABEL
  await prisma.user.update({
    where: { id: session.user.id },
    data: { role: "LABEL" },
  });

  return NextResponse.json(label, { status: 201 });
}
