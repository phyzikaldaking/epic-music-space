import type { Context, Next } from "hono";

/**
 * Lightweight auth middleware for the standalone API.
 *
 * Reads the `Authorization: Bearer <token>` header, then verifies it against
 * the Supabase auth server.  If NEXT_PUBLIC_SUPABASE_URL is not set, the
 * middleware falls back to trusting a `x-ems-user-id` header (development only).
 *
 * On success the authenticated user ID is stored in `c.var.userId`.
 * On failure a 401 JSON response is returned immediately.
 */
export async function authMiddleware(c: Context, next: Next) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const authHeader = c.req.header("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");

  // ── Development bypass ───────────────────────────────────────────────────
  if (!supabaseUrl || !supabaseAnonKey) {
    if (process.env.NODE_ENV === "production") {
      return c.json({ error: "Auth not configured" }, 500);
    }
    const devUserId = c.req.header("x-ems-user-id");
    if (!devUserId) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    c.set("userId", devUserId);
    return next();
  }

  // ── Supabase JWT verification ────────────────────────────────────────────
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
    });

    if (!response.ok) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const user = (await response.json()) as { id: string };
    if (!user?.id) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("userId", user.id);
  } catch {
    return c.json({ error: "Auth service unavailable" }, 503);
  }

  return next();
}
