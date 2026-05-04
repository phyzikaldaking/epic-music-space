import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { logAdminAction, ipFromRequest } from "@/lib/adminAudit";
import { checkAdminIpAllowlist } from "@/lib/adminGuard";

async function requireAdmin(req: NextRequest) {
  const ipBlock = checkAdminIpAllowlist(req);
  if (ipBlock) return null;
  const session = await auth();
  if (!session?.user?.id) return null;
  if (session.user.role !== "ADMIN") return null;
  return session;
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const PAGE_SIZE = 50;

  const where = q
    ? {
        OR: [
          { title: { contains: q, mode: "insensitive" as const } },
          { artist: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [songs, total] = await Promise.all([
    prisma.song.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        title: true,
        artist: true,
        genre: true,
        isActive: true,
        hasStems: true,
        aiScore: true,
        soldLicenses: true,
        totalLicenses: true,
        licensePrice: true,
        createdAt: true,
        artist_: { select: { email: true } },
      },
    }),
    prisma.song.count({ where }),
  ]);

  return NextResponse.json({
    songs: songs.map((s) => ({
      ...s,
      licensePrice: Number(s.licensePrice),
      createdAt: s.createdAt.toISOString(),
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
}

const patchSchema = z.object({
  songId: z.string(),
  action: z.enum(["toggle_active", "delete"]),
});

export async function PATCH(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as unknown;
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { songId, action } = parsed.data;
  const ip = ipFromRequest(req);

  if (action === "delete") {
    await prisma.song.delete({ where: { id: songId } });
    await logAdminAction({
      adminId: session.user.id,
      adminEmail: session.user.email,
      action: "song.delete",
      target: songId,
      ip,
    });
    return NextResponse.json({ deleted: true });
  }

  const song = await prisma.song.findUnique({ where: { id: songId }, select: { isActive: true } });
  if (!song) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.song.update({
    where: { id: songId },
    data: { isActive: !song.isActive },
    select: { id: true, isActive: true },
  });

  await logAdminAction({
    adminId: session.user.id,
    adminEmail: session.user.email,
    action: "song.toggle_active",
    target: songId,
    metadata: { isActive: updated.isActive },
    ip,
  });

  return NextResponse.json(updated);
}
