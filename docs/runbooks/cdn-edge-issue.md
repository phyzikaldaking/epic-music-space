# Vercel / CDN edge issue

## Signals
- 5xx from Vercel's edge — body says `FUNCTION_INVOCATION_FAILED`,
  `EDGE_FUNCTION_INVOCATION_FAILED`, or `BODY_NOT_A_STRING_FROM_FUNCTION`
- Cache returning stale content after a deploy
- Asset 404s for files that exist in `apps/web/public/`
- Static images flickering / broken / not loading

## Triage
1. Check `https://vercel-status.com` and the project's deploys page.
2. Confirm: is it the framework runtime or our code? `FUNCTION_INVOCATION_FAILED`
   → our code threw before we returned a response. `BODY_NOT_A_STRING…` →
   we returned a stream that the runtime couldn't serialize.
3. Reproduce locally with `vercel dev` or the production build:
   ```bash
   npm run build:web && (cd apps/web && npm run start)
   ```

## Recovery — bad deploy
- `vercel rollback` against the production project. The previous successful
  deploy resumes serving in seconds.
- Do not re-promote the broken deploy "to retry." Land a fix on `main`,
  redeploy.

## Recovery — stale edge cache
- For full-page caches: bump the deploy. Vercel's edge cache is keyed by
  deploy id, so a fresh deploy is the cleanest invalidation.
- For tag-based revalidation: call `revalidateTag` from a route. The CACHE_TAGS
  used by the codebase live in `lib/cacheTags.ts`.
- For ISR: trigger the revalidate route or wait for the next on-demand hit.

## Recovery — third-party CDN (Mux / Supabase) failing
- Stream proxy at `/api/songs/[id]/stream` falls back through `classifyAudioSource`.
  If Supabase is the problem and audio is hosted there, expect 502s through
  our proxy — that's correct behavior, the proxy is not at fault.
- For Mux issues, check `https://status.mux.com`. The Mux player has built-in
  retry; the user-visible experience usually self-heals within a minute.

## What NOT to do
- Do not commit a "rollback" by reverting the offending PR if the deploy is
  already in production. `vercel rollback` is faster and reversible.
- Do not aggressively `purge` Vercel cache — it can cascade into a load
  spike on the origin DB. Use targeted `revalidateTag`.
- Do not change DNS during an active edge outage. DNS propagation is slow
  and will outlive the incident.
