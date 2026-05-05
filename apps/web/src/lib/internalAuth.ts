import { timingSafeEqual } from "node:crypto";
import { auth } from "@/lib/auth";

function safeEquals(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Authorize a request as either a logged-in user OR an internal route-to-route
 * call carrying x-internal-token === INTERNAL_API_TOKEN.
 *
 * If INTERNAL_API_TOKEN isn't configured, internal-token auth is disabled and
 * only real user sessions are accepted.
 */
export async function requireInternalOrAuth(req: Request): Promise<
  | { ok: true; userId: string | null }
  | { ok: false; status: number; error: string }
> {
  const token = process.env.INTERNAL_API_TOKEN;
  const supplied = req.headers.get("x-internal-token");
  if (token && supplied && safeEquals(supplied, token)) {
    return { ok: true, userId: null };
  }

  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true, userId: session.user.id };
}

export const INTERNAL_TOKEN_HEADER = "x-internal-token";

export function internalAuthHeaders(): Record<string, string> {
  const token = process.env.INTERNAL_API_TOKEN;
  return token ? { [INTERNAL_TOKEN_HEADER]: token } : {};
}
