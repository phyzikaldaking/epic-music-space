import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Browser-side Supabase client used ONLY for Realtime subscriptions.
 * Auth and data are handled by NextAuth + Prisma.
 * Returns null when env vars are not configured (graceful degradation).
 *
 * Singleton — returns the same instance on every call to avoid the
 * "Multiple GoTrueClient instances detected" browser warning.
 */
let _browserClient: ReturnType<typeof createClient> | null = null;

export function createBrowserSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  if (!_browserClient) {
    const globalKey = "__emsBrowserSupabaseClient";
    const globalState = globalThis as typeof globalThis & {
      [globalKey]?: ReturnType<typeof createClient>;
    };

    _browserClient =
      globalState[globalKey] ??
      createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false },
      });

    globalState[globalKey] = _browserClient;
  }
  return _browserClient;
}

/**
 * Server-side Supabase admin client used for Storage operations.
 * Uses the service role key — NEVER expose this to the browser.
 * Returns null when env vars are not configured.
 */
export function createServerSupabaseClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type SupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;

// ─────────────────────────────────────────────────────────
// Realtime channel names
// ─────────────────────────────────────────────────────────

export const CHANNELS = {
  marketplace: "ems:marketplace",
  songs: "ems:songs",
  leaderboard: "ems:leaderboard",
  versus: (matchId: string) => `ems:versus:${matchId}`,
  royale: (battleId: string) => `ems:royale:${battleId}`,
  notifications: (userId: string) => `ems:notifications:${userId}`,
  room: (roomId: string) => `ems:room:${roomId}`,
  conversation: (conversationId: string) => `ems:conv:${conversationId}`,
} as const;
