import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { checkAdminIpAllowlist } from "@/lib/adminGuard";
import { ipFromRequest, logAdminAction } from "@/lib/adminAudit";

export const runtime = "nodejs";

const GUARD_KEY = "ems:stream:guard:global";

const patchSchema = z.object({
  mode: z.enum(["normal", "preview_only", "blocked"]),
  reason: z.string().trim().max(300).optional(),
  durationMinutes: z.number().int().min(1).max(24 * 60).optional(),
});

async function requireAdmin(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, status: 401 };
  if (session.user.role !== "ADMIN") return { ok: false as const, status: 403 };
  if (checkAdminIpAllowlist(req)) return { ok: false as const, status: 403 };
  return { ok: true as const, session };
}

export async function GET(req: NextRequest) {
  const authz = await requireAdmin(req);
  if (!authz.ok) return NextResponse.json({ error: "Forbidden" }, { status: authz.status });

  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({
      mode: "normal",
      reason: null,
      ttlSeconds: null,
      source: "redis_unavailable",
    });
  }

  try {
    const [raw, ttl] = await Promise.all([redis.get(GUARD_KEY), redis.ttl(GUARD_KEY)]);
    if (!raw) {
      return NextResponse.json({ mode: "normal", reason: null, ttlSeconds: null, source: "default" });
    }

    const parsed = JSON.parse(raw) as { mode?: string; reason?: string | null; setBy?: string | null; setAt?: string | null };
    return NextResponse.json({
      mode: parsed.mode === "preview_only" || parsed.mode === "blocked" ? parsed.mode : "normal",
      reason: parsed.reason ?? null,
      ttlSeconds: ttl > 0 ? ttl : null,
      setBy: parsed.setBy ?? null,
      setAt: parsed.setAt ?? null,
      source: "redis",
    });
  } catch {
    return NextResponse.json({ mode: "normal", reason: null, ttlSeconds: null, source: "parse_error" });
  }
}

export async function PATCH(req: NextRequest) {
  const authz = await requireAdmin(req);
  if (!authz.ok) return NextResponse.json({ error: "Forbidden" }, { status: authz.status });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ error: "Redis unavailable" }, { status: 503 });
  }

  const adminUser = await prisma.user.findUnique({
    where: { id: authz.session.user.id },
    select: { email: true },
  });

  const mode = parsed.data.mode;
  const reason = parsed.data.reason ?? null;
  const durationMinutes = parsed.data.durationMinutes;

  if (mode === "normal") {
    await redis.del(GUARD_KEY);
  } else {
    const payload = JSON.stringify({
      mode,
      reason,
      setBy: authz.session.user.id,
      setAt: new Date().toISOString(),
    });
    if (durationMinutes) {
      await redis.set(GUARD_KEY, payload, "EX", durationMinutes * 60);
    } else {
      await redis.set(GUARD_KEY, payload);
    }
  }

  await logAdminAction({
    adminId: authz.session.user.id,
    adminEmail: adminUser?.email ?? authz.session.user.email,
    action: "risk.stream_guard",
    target: mode,
    metadata: { mode, reason, durationMinutes: durationMinutes ?? null },
    ip: ipFromRequest(req),
  });

  const ttl = await redis.ttl(GUARD_KEY);
  return NextResponse.json({
    ok: true,
    mode,
    reason,
    ttlSeconds: ttl > 0 ? ttl : null,
  });
}
