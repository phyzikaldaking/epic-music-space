import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const bodySchema = z.object({
  token: z.string().min(1).max(512),
  platform: z.enum(["ios", "android", "web"]),
});

/**
 * POST /api/push/register
 *
 * Stores a device push token for the authenticated user. Upserts on the
 * unique token so re-registrations (fresh installs, token rotation) stay
 * idempotent. Web platform tokens are accepted but silently ignored —
 * only iOS / Android tokens are persisted.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { token, platform } = parsed.data;

  // Web push not stored — native only.
  if (platform === "web") {
    return NextResponse.json({ ok: true });
  }

  await prisma.pushToken.upsert({
    where: { token },
    update: { userId: session.user.id, platform, updatedAt: new Date() },
    create: { userId: session.user.id, token, platform },
  });

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/push/register
 *
 * Removes a push token (called on sign-out so the user stops receiving
 * notifications on this device).
 */
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = z
    .object({ token: z.string().min(1).max(512) })
    .safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  await prisma.pushToken
    .deleteMany({
      where: { token: parsed.data.token, userId: session.user.id },
    })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}
