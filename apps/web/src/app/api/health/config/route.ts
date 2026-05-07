import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { summarizeEnvForHealthCheck } from "@/lib/requiredEnv";

/**
 * GET /api/health/config
 *
 * Admin-only configuration health check. Returns presence flags for
 * every required + recommended env var, never the values themselves
 * (except NEXTAUTH_URL, which is a public domain string).
 *
 * Use case: after a deploy, curl this with an admin session cookie to
 * verify the environment is intact. Catches the failure mode where
 * `vercel env pull` redacts production secrets, leaving you unable
 * to confirm whether a key is truly set or empty.
 *
 * Returns 401 for unauthenticated requests, 403 for non-admins, and
 * 200 with the summary for ADMIN role.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(summarizeEnvForHealthCheck(), {
    headers: { "Cache-Control": "no-store" },
  });
}
