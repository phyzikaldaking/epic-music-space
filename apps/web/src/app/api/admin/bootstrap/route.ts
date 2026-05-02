import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/bootstrap?secret=<ADMIN_BOOTSTRAP_SECRET>
 *
 * One-time endpoint to grant the logged-in user ADMIN role.
 * Requires the ADMIN_BOOTSTRAP_SECRET env var to be set and matched.
 * Remove or unset the env var after use to disable this endpoint.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.ADMIN_BOOTSTRAP_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Bootstrap is disabled" }, { status: 403 });
  }

  const provided = req.nextUrl.searchParams.get("secret");
  if (provided !== secret) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 403 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Sign in first, then visit this URL" },
      { status: 401 }
    );
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { role: "ADMIN" },
  });

  return NextResponse.json({
    ok: true,
    message: `${session.user.email} is now ADMIN. Visit /admin to manage the platform.`,
  });
}
