import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAdminAction, ipFromRequest } from "@/lib/adminAudit";
import { requireBearerEnvSecret } from "@/lib/routeAuth";

/**
 * POST /api/admin/bootstrap
 * Authorization: Bearer <ADMIN_BOOTSTRAP_SECRET>
 *
 * One-time endpoint to grant the logged-in user ADMIN role.
 * Requires the ADMIN_BOOTSTRAP_SECRET env var to be set and matched against
 * the Authorization Bearer header (so it doesn't appear in access logs or
 * Referer headers like a query-string secret would).
 *
 * Remove or unset the env var after use to disable this endpoint.
 */
export async function POST(req: NextRequest) {
  const guard = requireBearerEnvSecret(req, "ADMIN_BOOTSTRAP_SECRET", "Bootstrap is disabled");
  if (!guard.ok) return guard.response;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Sign in first, then call this endpoint with your bearer token" },
      { status: 401 },
    );
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { role: "ADMIN" },
  });

  await logAdminAction({
    adminId: session.user.id,
    adminEmail: session.user.email,
    action: "user.bootstrap_admin",
    target: session.user.id,
    ip: ipFromRequest(req),
  });

  return NextResponse.json({
    ok: true,
    message: `${session.user.email} is now ADMIN. Visit /admin to manage the platform.`,
  });
}
