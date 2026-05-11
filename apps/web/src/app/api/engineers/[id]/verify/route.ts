import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Admin-only verification flip for an engineer profile. We don't ask
// admins to commit to a fancy review workflow — toggling verifiedAt
// here is what unlocks ENGINEER_MIX / ENGINEER_MASTER listings for
// that engineer.

const verifySchema = z.object({
  verified: z.boolean(),
  note: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (me?.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as unknown;
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { id } = await ctx.params;
  const profile = await prisma.engineerProfile.update({
    where: { id },
    data: {
      verifiedAt: parsed.data.verified ? new Date() : null,
      verificationNote: parsed.data.note ?? null,
    },
  });

  return NextResponse.json({ profile });
}
