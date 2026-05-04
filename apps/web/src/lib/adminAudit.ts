import { prisma } from "@/lib/prisma";

interface AuditEntry {
  adminId: string;
  adminEmail?: string | null;
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

/**
 * Log an admin action. Best-effort: never throws — a logging failure must
 * never block the admin's actual operation.
 */
export async function logAdminAction(entry: AuditEntry): Promise<void> {
  try {
    await prisma.adminActionLog.create({
      data: {
        adminId: entry.adminId,
        adminEmail: entry.adminEmail ?? null,
        action: entry.action,
        target: entry.target ?? null,
        metadata: (entry.metadata ?? {}) as object,
        ip: entry.ip ?? null,
      },
    });
  } catch (err) {
    console.error("[adminAudit] log failed", { entry, err });
  }
}

export function ipFromRequest(req: { headers: Headers }): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}
