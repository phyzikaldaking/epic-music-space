import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAdminAction, ipFromRequest } from "@/lib/adminAudit";
import { checkAdminIpAllowlist } from "@/lib/adminGuard";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/admin/users/export
 *
 * Streams every user as a CSV. Admin-only. Includes the same role + tier
 * fields the /admin/users UI shows plus license + song counts. Audit-logged.
 */
function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : v instanceof Date ? v.toISOString() : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: NextRequest) {
  if (checkAdminIpAllowlist(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      username: true,
      role: true,
      subscriptionTier: true,
      emailVerified: true,
      stripeConnectId: true,
      connectChargesEnabled: true,
      connectPayoutsEnabled: true,
      createdAt: true,
      _count: { select: { songs: true, licenses: true, followers: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const headers = [
    "id",
    "email",
    "name",
    "username",
    "role",
    "tier",
    "email_verified",
    "stripe_connect_id",
    "charges_enabled",
    "payouts_enabled",
    "songs",
    "licenses",
    "followers",
    "created_at",
  ];

  const lines: string[] = [headers.join(",")];
  for (const u of users) {
    lines.push(
      [
        u.id,
        u.email,
        u.name,
        u.username,
        u.role,
        u.subscriptionTier,
        u.emailVerified ? u.emailVerified.toISOString() : "",
        u.stripeConnectId,
        u.connectChargesEnabled,
        u.connectPayoutsEnabled,
        u._count.songs,
        u._count.licenses,
        u._count.followers,
        u.createdAt,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  const body = lines.join("\n");

  await logAdminAction({
    adminId: session.user.id,
    adminEmail: session.user.email,
    action: "users.export_csv",
    metadata: { rowCount: users.length },
    ip: ipFromRequest(req),
  });

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ems-users-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
