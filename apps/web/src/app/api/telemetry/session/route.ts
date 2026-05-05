import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const bodySchema = z.object({
  platform: z.string().max(20),
  osVersion: z.string().max(50),
  appVersion: z.string().max(30),
  appBuild: z.string().max(30),
});

/**
 * POST /api/telemetry/session
 *
 * Records a lightweight daily session ping from the native app shell.
 * Used to track real-world version distribution and platform mix without
 * a third-party analytics SDK.
 *
 * - Unauthenticated users are accepted (stores userId as null).
 * - Body is validated but failures return 200 to avoid crashing the bridge.
 * - Data stored in UserBehaviorEvent with type "native_session".
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    // Return 200 — telemetry failure must never affect the user.
    return NextResponse.json({ ok: true });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: true });
  }

  const { platform, osVersion, appVersion, appBuild } = parsed.data;

  // Get the user if they're signed in (optional).
  const session = await auth().catch(() => null);
  const userId = session?.user?.id ?? null;

  try {
    await prisma.nativeTelemetryEvent.create({
      data: {
        userId,
        platform,
        osVersion,
        appVersion,
        appBuild,
      },
    });
  } catch {
    // Non-critical — swallow DB errors.
  }

  return NextResponse.json({ ok: true });
}
