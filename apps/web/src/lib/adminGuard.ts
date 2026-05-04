import type { NextRequest } from "next/server";
import { ipFromRequest } from "@/lib/adminAudit";

/**
 * Optional second layer of defence on /api/admin/*: if `ADMIN_IP_ALLOWLIST`
 * is set (comma-separated CIDRs or exact IPs), reject any request whose
 * source IP isn't on the list.
 *
 * Returns null when the request is allowed, or a string error to short-circuit.
 *
 * Disabled (returns null) when the env var is unset — so it's opt-in and
 * doesn't lock anyone out by default.
 */
export function checkAdminIpAllowlist(req: NextRequest | { headers: Headers }): string | null {
  const raw = process.env.ADMIN_IP_ALLOWLIST?.trim();
  if (!raw) return null;

  const allowed = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length === 0) return null;

  const ip = ipFromRequest(req);
  if (ip === "unknown") return "Could not determine client IP";

  // Exact match (CIDR support intentionally omitted for now — most installs
  // pin a single static IP / VPN gateway).
  if (allowed.includes(ip)) return null;

  return `Source IP ${ip} not on admin allowlist`;
}
