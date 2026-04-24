import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const runtime = "nodejs";

function requireAdmin(role: string | undefined | null) {
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  const forbidden = requireAdmin(session?.user?.role);
  if (forbidden) return forbidden;

  const { searchParams } = req.nextUrl;
  const query = searchParams.get("q")?.trim() ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const take = 50;
  const skip = (page - 1) * take;

  const where = query
    ? {
        OR: [
          { email: { contains: query, mode: "insensitive" as const } },
          { name: { contains: query, mode: "insensitive" as const } },
          { username: { contains: query, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        subscriptionTier: true,
        createdAt: true,
        emailVerified: true,
        _count: { select: { songs: true, licenses: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({ users, total, page, pages: Math.ceil(total / take) });
}

const patchSchema = z.object({
  userId: z.string().cuid(),
  role: z.enum(["LISTENER", "ARTIST", "LABEL", "ADMIN"]).optional(),
  subscriptionTier: z.enum(["FREE", "STARTER", "PRO", "PRIME", "LABEL_TIER"]).optional(),
});

export async function PATCH(req: NextRequest) {
  const session = await auth();
  const forbidden = requireAdmin(session?.user?.role);
  if (forbidden) return forbidden;

  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const { userId, role, subscriptionTier } = parsed.data;

  const data: Record<string, unknown> = {};
  if (role) data.role = role;
  if (subscriptionTier) data.subscriptionTier = subscriptionTier;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: data as Parameters<typeof prisma.user.update>[0]["data"],
    select: { id: true, role: true, subscriptionTier: true },
  });

  return NextResponse.json({ user });
}
