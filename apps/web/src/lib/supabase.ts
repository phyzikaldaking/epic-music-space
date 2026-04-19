import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Browser-side Supabase client used ONLY for Realtime subscriptions.
 * Auth and data are handled by NextAuth + Prisma.
 * Returns null when env vars are not configured (graceful degradation).
 */
export function createBrowserSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });
}

export type SupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;

// ─────────────────────────────────────────────────────────
// Realtime channel names
// ─────────────────────────────────────────────────────────

export const CHANNELS = {
  marketplace: "ems:marketplace",
  versus: (matchId: string) => `ems:versus:${matchId}`,
  notifications: (userId: string) => `ems:notifications:${userId}`,
} as const;
