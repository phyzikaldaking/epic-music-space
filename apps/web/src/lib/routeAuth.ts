import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

function safeEquals(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function bearerMatches(req: NextRequest, secret: string) {
  const provided = req.headers.get("authorization");
  if (!provided?.startsWith("Bearer ")) return false;
  return safeEquals(provided.slice("Bearer ".length), secret);
}

export function requireCronRequest(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Cron endpoint is not configured" }, { status: 503 }),
    };
  }

  if (!bearerMatches(req, secret)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true as const };
}

export async function requireAdminOrCron(req: NextRequest) {
  const cron = requireCronRequest(req);
  if (cron.ok) return cron;

  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true as const, session };
}

export function requireBearerEnvSecret(
  req: NextRequest,
  envKey: string,
  disabledMessage = "This endpoint is disabled",
) {
  const secret = process.env[envKey];
  if (!secret) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: disabledMessage }, { status: 403 }),
    };
  }

  if (!bearerMatches(req, secret)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Invalid secret" }, { status: 403 }),
    };
  }

  return { ok: true as const };
}
