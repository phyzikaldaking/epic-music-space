import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * GET  /api/admin/reports?status=PENDING|REVIEWED|DISMISSED|ACTIONED
 * PATCH /api/admin/reports  body: { id, status }
 *
 * Admin-only. Returns the moderation queue or transitions a single report
 * row's status (REVIEWED / DISMISSED / ACTIONED).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "PENDING";
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));

  const reports = await prisma.userReport.findMany({
    where: { status },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      reporter: { select: { id: true, name: true, email: true } },
      reportedUser: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({ reports });
}

const patchSchema = z.object({
  id: z.string().cuid(),
  status: z.enum(["REVIEWED", "DISMISSED", "ACTIONED"]),
});

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const updated = await prisma.userReport.update({
    where: { id: parsed.data.id },
    data: { status: parsed.data.status, reviewedAt: new Date() },
    select: { id: true, status: true, reviewedAt: true },
  });
  return NextResponse.json({ report: updated });
}
