import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { maybeAwardEarlyAdopter } from "@/lib/badges";
import { randomBytes } from "crypto";

function generateCode(): string {
  return randomBytes(5).toString("hex").toUpperCase(); // 10-char hex code
}

const registerSchema = z.object({
  name:       z.string().min(1).max(100),
  email:      z.string().email(),
  password:   z.string().min(8).max(128),
  role:       z.enum(["LISTENER", "ARTIST", "LABEL"]).default("LISTENER"),
  inviteCode: z.string().max(20).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const { name, email, password, role, inviteCode } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { name, email, passwordHash, role },
      select: { id: true, email: true, name: true, role: true },
    });

    // Create a personal invite code for the new user
    await prisma.inviteCode.create({
      data: {
        code: generateCode(),
        createdById: user.id,
      },
    }).catch(() => { /* ignore on collision */ });

    // Award EARLY_ADOPTER badge if within the first 1 000 users
    await maybeAwardEarlyAdopter(user.id);

    // Apply invite code if provided
    if (inviteCode) {
      const code = inviteCode.trim().toUpperCase();
      const invite = await prisma.inviteCode.findUnique({ where: { code } });
      if (invite && !invite.usedById && invite.createdById !== user.id) {
        await prisma.inviteCode.update({
          where: { id: invite.id },
          data: { usedById: user.id, usedAt: new Date() },
        });
        // Check milestone badges for the inviter
        const { checkInviteMilestones } = await import("@/lib/badges");
        await checkInviteMilestones(invite.createdById);
      }
    }

    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    console.error("[register]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

