/**
 * Returns the proxied stream URL for a given song id. Use this everywhere
 * the browser will load audio so the underlying Supabase URL is never
 * exposed in the network panel.
 *
 * The proxy enforces Origin/Referer and rate limits — see
 * `apps/web/src/app/api/songs/[id]/stream/route.ts`.
 */
export function getStreamUrl(songId: string): string {
  return `/api/songs/${songId}/stream`;
}
