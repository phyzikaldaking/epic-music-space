import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { strictLimiter } from "@/lib/rateLimit";

const schema = z.object({
  code: z.string().min(1).max(20).transform((s) => s.trim().toUpperCase()),
});

/**
 * POST /api/invite/use
 * Applies an invite code to the currently authenticated user.
 * Requires a valid session — the user ID comes from the session, never the client.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Strict per-(user, IP) limiter — guessing invite codes is a real
  // attack surface (each one is worth referral credit + invite badges).
  // Per-user caps churn from one hijacked session; per-IP catches
  // distributed brute-forcing across logged-in accounts.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await strictLimiter.consume(`invite-use:user:${session.user.id}`);
    await strictLimiter.consume(`invite-use:ip:${ip}`);
  } catch {
    return NextResponse.json(
      { error: "Too many invite attempts. Try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { code } = parsed.data;
  const newUserId = session.user.id;

  const invite = await prisma.inviteCode.findUnique({ where: { code } });

  if (!invite) {
    return NextResponse.json({ error: "Invite code not found." }, { status: 404 });
  }
  if (invite.usedById) {
    return NextResponse.json({ error: "Invite code already used." }, { status: 409 });
  }
  if (invite.createdById === newUserId) {
    return NextResponse.json({ error: "You cannot use your own invite code." }, { status: 400 });
  }

  await prisma.inviteCode.update({
    where: { id: invite.id },
    data: { usedById: newUserId, usedAt: new Date() },
  });

  const { checkInviteMilestones } = await import("@/lib/badges");
  await checkInviteMilestones(invite.createdById);

  return NextResponse.json({ ok: true, inviterId: invite.createdById });
}
