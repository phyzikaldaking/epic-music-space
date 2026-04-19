import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  code:      z.string().min(1).max(20).transform((s) => s.trim().toUpperCase()),
  newUserId: z.string().cuid(),
});

/**
 * POST /api/invite/use
 * Called during registration to apply an invite code.
 * Marks the code as used and triggers inviter milestone badge checks.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { code, newUserId } = parsed.data;

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

  // Mark invite as used
  await prisma.inviteCode.update({
    where: { id: invite.id },
    data: { usedById: newUserId, usedAt: new Date() },
  });

  // Check milestone badges for inviter (imported lazily to avoid circular deps)
  const { checkInviteMilestones } = await import("@/lib/badges");
  await checkInviteMilestones(invite.createdById);

  return NextResponse.json({ ok: true, inviterId: invite.createdById });
}
